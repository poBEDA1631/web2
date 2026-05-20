const request = require('supertest');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

// Mock amqplib before importing the app to avoid connection errors during test
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn(),
      consume: jest.fn(),
      sendToQueue: jest.fn(),
    }),
  }),
}));

const app = require('../server');
const db = require('../database');

describe('Security Flow (Auth Middleware)', () => {
  // Clear the table before tests
  beforeEach(() => {
    db.prepare('DELETE FROM jobs').run();
  });

  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/jobs/some-job-id');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/Missing or invalid token/);
  });

  it('should not allow access to a job belonging to a different userId', async () => {
    // Generate valid tokens for two different users
    const user1Token = jwt.sign({ userId: 'user-001' }, JWT_SECRET, { expiresIn: '1h' });
    const user2Token = jwt.sign({ userId: 'user-002' }, JWT_SECRET, { expiresIn: '1h' });

    // Insert a job owned by user-001
    db.prepare(`
      INSERT INTO jobs (id, userId, status, type, sourceUrl) 
      VALUES (?, ?, ?, ?, ?)
    `).run('job-100', 'user-001', 'CREATED', 'blur', 'http://example.com/test.jpg');

    // Attempt to access user-001's job with user-002's token
    const res = await request(app)
      .get('/jobs/job-100')
      .set('Authorization', `Bearer ${user2Token}`);
    
    // As per the job controller logic, it should return 404 "Job not found or access denied"
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Job not found or access denied');
  });

  it('should return a token on /auth/login', async () => {
    const res = await request(app).get('/auth/login');
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Login successful');
    expect(res.body.token).toBeDefined();

    // Verify token can be decoded
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.userId).toBe('user_123');
  });
});
