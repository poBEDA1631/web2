const request = require('supertest');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

const mockSendToQueue = jest.fn();
const mockAck = jest.fn();
const mockNack = jest.fn();

// Mock amqplib before importing the app
jest.mock('amqplib', () => ({
    connect: jest.fn().mockResolvedValue({
        createChannel: jest.fn().mockResolvedValue({
            assertQueue: jest.fn(),
            consume: jest.fn(),
            sendToQueue: mockSendToQueue,
            ack: mockAck,
            nack: mockNack
        }),
    }),
}));

const app = require('../server');
const db = require('../database');

describe('Jobs Logic - Business Flow and Contract Tests', () => {
    let userToken;

    beforeAll(() => {
        userToken = jwt.sign({ userId: 'test-user-1' }, JWT_SECRET, { expiresIn: '1h' });
    });

    beforeEach(() => {
        // Clear jobs before each test
        db.prepare('DELETE FROM jobs').run();
        mockSendToQueue.mockClear();

        // We also need to give the mock connection time to settle so the channel is available
        // because connection is established asynchronously in jobs.js.
        // However, since it's mocked with resolved promises, the event loop handles it during require.
    });

    it('Business Flow: should create a job, save to SQLite, and return 201', async () => {
        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                sourceUrl: 'http://test.com/dog.jpg',
                type: 'blur'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.status).toBe('QUEUED');
        expect(res.body.sourceUrl).toBe('http://test.com/dog.jpg');
        expect(res.body.type).toBe('blur');

        const jobId = res.body.id;

        // Verify it was correctly saved to the in-memory SQLite database
        const jobInDb = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
        expect(jobInDb).toBeDefined();
        expect(jobInDb.type).toBe('blur');
        expect(jobInDb.status).toBe('QUEUED');
        expect(jobInDb.userId).toBe('test-user-1');
    });

    it('Contract Test: should send message to RabbitMQ with jobId, type, sourceUrl', async () => {
        // There is a slight async race condition in jobs.js because channel setup is async.
        // Assuming the event loop processes the mock promise resolution immediately.

        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                sourceUrl: 'http://test.com/cat.jpg',
                type: 'grayscale'
            });

        expect(res.statusCode).toBe(201);

        // Verify that RabbitMQ sendToQueue was called
        expect(mockSendToQueue).toHaveBeenCalled();

        const queueName = mockSendToQueue.mock.calls[0][0];
        const bufferData = mockSendToQueue.mock.calls[0][1];
        const options = mockSendToQueue.mock.calls[0][2];

        expect(queueName).toBe('image_tasks');
        expect(options).toEqual(expect.objectContaining({ persistent: true }));

        // Contract test part: parse buffer and check format
        const message = JSON.parse(bufferData.toString());

        // Verify all required fields for Worker contract
        expect(message).toHaveProperty('jobId', res.body.id);
        expect(message).toHaveProperty('type', 'grayscale');
        expect(message).toHaveProperty('sourceUrl', 'http://test.com/cat.jpg');
    });

    it('should return 400 if sourceUrl or type is missing', async () => {
        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ sourceUrl: 'http://test.com/dog.jpg' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('sourceUrl and type are required');
    });

    it('should return a list of jobs on GET /jobs', async () => {
        db.prepare('INSERT INTO jobs (id, userId, status, type, sourceUrl) VALUES (?, ?, ?, ?, ?)').run('job-1', 'test-user-1', 'CREATED', 'blur', 'http://test.com/1.jpg');
        db.prepare('INSERT INTO jobs (id, userId, status, type, sourceUrl) VALUES (?, ?, ?, ?, ?)').run('job-2', 'test-user-1', 'QUEUED', 'resize', 'http://test.com/2.jpg');

        const res = await request(app)
            .get('/jobs')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2);
    });

    it('should return a specific job on GET /jobs/:id', async () => {
        db.prepare('INSERT INTO jobs (id, userId, status, type, sourceUrl) VALUES (?, ?, ?, ?, ?)').run('job-123', 'test-user-1', 'PROCESSING', 'blur', 'http://test.com/1.jpg');

        const res = await request(app)
            .get('/jobs/job-123')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.id).toBe('job-123');
        expect(res.body.status).toBe('PROCESSING');
    });

    it('should handle database errors gracefully on GET /jobs', async () => {
        jest.spyOn(db, 'prepare').mockImplementationOnce(() => ({
            all: () => { throw new Error('Database connection failed'); }
        }));

        const res = await request(app)
            .get('/jobs')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Failed to fetch jobs');

        jest.restoreAllMocks();
    });

    it('should handle database errors gracefully on GET /jobs/:id', async () => {
        jest.spyOn(db, 'prepare').mockImplementationOnce(() => ({
            get: () => { throw new Error('Database error'); }
        }));

        const res = await request(app)
            .get('/jobs/job-1')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Failed to fetch job');

        jest.restoreAllMocks();
    });

    it('should handle database errors gracefully on POST /jobs', async () => {
        jest.spyOn(db, 'prepare').mockImplementationOnce(() => ({
            run: () => { throw new Error('Database insert failed'); }
        }));

        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ sourceUrl: 'http://test.com/x.jpg', type: 'blur' });

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Failed to create job');

        jest.restoreAllMocks();
    });
});