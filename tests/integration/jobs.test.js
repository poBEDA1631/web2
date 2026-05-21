process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const app = require('../../server');
const db = require('../../database');
const { JWT_SECRET } = require('../../middleware/auth');
const { ERRORS } = require('../../routes/jobs');
const { buildJob } = require('../builders/jobBuilder');
const { JobMessageSchema } = require('../schemas/jobMessage');

// --- Module-Level Mocks (Section 7.1) ---
jest.mock('amqplib', () => {
    const mockSendToQueue = jest.fn();
    const mockAck = jest.fn();
    const mockNack = jest.fn();
    return {
        connect: jest.fn().mockResolvedValue({
            createChannel: jest.fn().mockResolvedValue({
                assertQueue: jest.fn(),
                consume:     jest.fn(),
                sendToQueue: mockSendToQueue,
                ack:         mockAck,
                nack:        mockNack
            }),
        }),
        mockSendToQueue,
        mockAck,
        mockNack
    };
});

const { mockSendToQueue, mockAck, mockNack } = require('amqplib');

describe('Jobs Logic - Business Flow and Contract Tests', () => {
    let userToken;

    beforeAll(() => {
        userToken = jwt.sign({ userId: 'test-user-1' }, JWT_SECRET);
    });

    beforeEach(() => {
        db.prepare('DELETE FROM jobs').run();
        mockSendToQueue.mockClear();
    });

    // --- HAPPY PATH / BUSINESS FLOWS (§12 Coverage Targets) ---

    it('Business Flow: should create a job, save to SQLite, publish to queue, and return 201', async () => {
        const payload = buildJob({ type: 'grayscale' });

        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send(payload);

        expect(res.statusCode).toBe(StatusCodes.CREATED);
        expect(res.body.id).toBeDefined();
        expect(res.body.userId).toBe('test-user-1');
        expect(res.body.status).toBe('QUEUED');
        expect(res.body.type).toBe('grayscale');
        expect(res.body.sourceUrl).toBe('http://test.com/fixture.jpg');

        const jobInDb = db.prepare('SELECT * FROM jobs WHERE id = ?').get(res.body.id);
        expect(jobInDb).toBeDefined();
        expect(jobInDb.status).toBe('QUEUED');
        expect(jobInDb.type).toBe('grayscale');

        expect(mockSendToQueue).toHaveBeenCalledTimes(1);
        const [queue, buffer, options] = mockSendToQueue.mock.calls[0];
        expect(queue).toBe('image_tasks');
        expect(options).toEqual({ persistent: true });

        const message = JSON.parse(buffer.toString());
        expect(() => JobMessageSchema.parse(message)).not.toThrow();
        expect(message.jobId).toBe(res.body.id);
        expect(message.type).toBe('grayscale');
    });

    it('Business Flow: should return list of jobs for the authenticated user', async () => {
        const stmt = db.prepare('INSERT INTO jobs (id, userId, status, type, sourceUrl) VALUES (?, ?, ?, ?, ?)');
        stmt.run('job-get-list-1', 'test-user-1', 'QUEUED', 'blur', 'http://test.com/1.jpg');
        stmt.run('job-get-list-2', 'test-user-1', 'DONE', 'resize', 'http://test.com/2.jpg');
        stmt.run('job-other-user', 'test-user-2', 'QUEUED', 'blur', 'http://test.com/3.jpg');

        const res = await request(app)
            .get('/jobs')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(StatusCodes.OK);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2);

        const jobIds = res.body.map(j => j.id);
        expect(jobIds).toContain('job-get-list-1');
        expect(jobIds).toContain('job-get-list-2');
        expect(jobIds).not.toContain('job-other-user');
    });

    it('Business Flow: should return a specific job by ID', async () => {
        const stmt = db.prepare('INSERT INTO jobs (id, userId, status, type, sourceUrl) VALUES (?, ?, ?, ?, ?)');
        stmt.run('job-get-single-1', 'test-user-1', 'QUEUED', 'blur', 'http://test.com/1.jpg');

        const res = await request(app)
            .get('/jobs/job-get-single-1')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(StatusCodes.OK);
        expect(res.body.id).toBe('job-get-single-1');
        expect(res.body.status).toBe('QUEUED');
    });

    // --- VALIDATION AND NEGATIVE TESTS (§12 Coverage Targets) ---

    it('should return 400 if type is missing', async () => {
        const payload = buildJob({ type: undefined });

        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send(payload);

        expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(res.body.error).toBe(ERRORS.MISSING_FIELDS);
    });

    it('should return 400 if sourceUrl is missing', async () => {
        const payload = buildJob({ sourceUrl: undefined });

        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send(payload);

        expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(res.body.error).toBe(ERRORS.MISSING_FIELDS);
    });

    it('should return 400 if sourceUrl has an invalid format', async () => {
        const payload = buildJob({ sourceUrl: 'invalid-url-format' });

        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send(payload);

        expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(res.body.error).toBe(ERRORS.INVALID_URL);
    });

    it('should return 404 if specific job ID does not exist', async () => {
        const res = await request(app)
            .get('/jobs/non-existent-id')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
        expect(res.body.error).toBe(ERRORS.NOT_FOUND_OR_DENIED);
    });

    it('should return 404 if requesting another users job', async () => {
        const stmt = db.prepare('INSERT INTO jobs (id, userId, status, type, sourceUrl) VALUES (?, ?, ?, ?, ?)');
        stmt.run('job-other-owner', 'test-user-2', 'QUEUED', 'blur', 'http://test.com/1.jpg');

        const res = await request(app)
            .get('/jobs/job-other-owner')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
        expect(res.body.error).toBe(ERRORS.NOT_FOUND_OR_DENIED);
    });

    // --- AUTHENTICATION TESTS (§12 Coverage Targets) ---

    it('should return 401 if authorization header is missing', async () => {
        const res = await request(app)
            .get('/jobs');

        expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect(res.body.error).toContain('Unauthorized');
    });

    it('should return 401 if authorization token is expired or invalid', async () => {
        const res = await request(app)
            .get('/jobs')
            .set('Authorization', 'Bearer invalid-token-value');

        expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect(res.body.error).toContain('Unauthorized');
    });

    // --- DATABASE ERROR RESILIENCE (§7.2 Spy-based Mocks) ---

    it('should handle database errors gracefully on GET /jobs', async () => {
        jest.spyOn(db, 'prepare').mockImplementationOnce(() => ({
            all: () => { throw new Error('Database connection failed'); }
        }));

        const res = await request(app)
            .get('/jobs')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(res.body.error).toBe(ERRORS.FETCH_FAILED);

        jest.restoreAllMocks();
    });

    it('should handle database errors gracefully on GET /jobs/:id', async () => {
        jest.spyOn(db, 'prepare').mockImplementationOnce(() => ({
            get: () => { throw new Error('Database connection failed'); }
        }));

        const res = await request(app)
            .get('/jobs/some-id')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(res.body.error).toBe(ERRORS.GET_FAILED);

        jest.restoreAllMocks();
    });

    it('should handle database errors gracefully on POST /jobs', async () => {
        jest.spyOn(db, 'prepare').mockImplementationOnce(() => ({
            run: () => { throw new Error('Database INSERT failed'); }
        }));

        const payload = buildJob();
        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send(payload);

        expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(res.body.error).toBe(ERRORS.CREATE_FAILED);

        jest.restoreAllMocks();
    });

    // --- CONSISTENCY GUARANTEES AND CORNER CASES (§10 & §12) ---

    it('Consistency: should leave job in DB with CREATED status if queue publish fails', async () => {
        mockSendToQueue.mockImplementationOnce(() => {
            throw new Error('Channel closed');
        });

        const payload = buildJob({ userId: 'test-user-1' });
        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send(payload);

        expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(res.body.error).toBe(ERRORS.CREATE_FAILED);

        const orphan = db.prepare('SELECT * FROM jobs WHERE userId = ?').get('test-user-1');
        expect(orphan).toBeDefined();
        expect(orphan.status).toBe('CREATED');
    });

    it('should handle RabbitMQ channel unavailable on startup by keeping status as CREATED and returning 201', async () => {
        let isolatedApp;
        let isolatedDb;
        jest.isolateModules(() => {
            const mockAmqp = require('amqplib');
            mockAmqp.connect.mockRejectedValueOnce(new Error('RabbitMQ connection failed'));

            isolatedApp = require('../../server');
            isolatedDb = require('../../database');
        });

        const payload = buildJob();
        const res = await request(isolatedApp)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send(payload);

        expect(res.statusCode).toBe(StatusCodes.CREATED);
        expect(res.body.status).toBe('CREATED');

        const jobInDb = isolatedDb.prepare('SELECT * FROM jobs WHERE id = ?').get(res.body.id);
        expect(jobInDb).toBeDefined();
        expect(jobInDb.status).toBe('CREATED');
    });
});
