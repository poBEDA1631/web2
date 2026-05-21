const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { verifyToken, JWT_SECRET } = require('../../middleware/auth');

describe('Auth Middleware - Token Verification', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        // Reset Express request/response mocks for each test
        req = {
            headers: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    it('should call next() and attach userId if a valid Bearer token is provided', () => {
        const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET);
        req.headers.authorization = `Bearer ${token}`;

        verifyToken(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.userId).toBe('user-123');
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('should return 401 if Authorization header is missing', () => {
        verifyToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Missing or invalid token' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if Authorization header does not start with Bearer', () => {
        req.headers.authorization = 'Basic dXNlcjpwYXNz';

        verifyToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Missing or invalid token' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is signed with an invalid secret key', () => {
        const token = jwt.sign({ userId: 'user-123' }, 'wrong_secret_key');
        req.headers.authorization = `Bearer ${token}`;

        verifyToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Invalid token' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if the token has expired', () => {
        // Sign token with an expiry of 0 seconds so it is instantly expired
        const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '0s' });
        req.headers.authorization = `Bearer ${token}`;

        verifyToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Invalid token' });
        expect(next).not.toHaveBeenCalled();
    });
});
