const { isValidTransition } = require('../utils/jobLogic');

describe('Job Logic - isValidTransition', () => {

    describe('Valid transitions (Happy Path)', () => {
        test.each([
            ['CREATED', 'QUEUED'],
            ['CREATED', 'FAILED'],
            ['QUEUED', 'PROCESSING'],
            ['QUEUED', 'FAILED'],
            ['PROCESSING', 'DONE'],
            ['PROCESSING', 'FAILED'],
        ])('should allow transition from %s to %s', (from, to) => {
            expect(isValidTransition(from, to)).toBe(true);
        });
    });

    describe('Invalid transitions', () => {
        test.each([
            ['DONE', 'CREATED'],     // Backwards
            ['CREATED', 'PROCESSING'], // Skipping steps
            ['CREATED', 'CREATED'],    // Same status
            ['FAILED', 'QUEUED'],    // Recovery not allowed
            ['UNKNOWN', 'QUEUED'],   // Invalid source
        ])('should NOT allow transition from %s to %s', (from, to) => {
            expect(isValidTransition(from, to)).toBe(false);
        });
    });

    describe('Edge cases and Input validation', () => {
        it('should return false if arguments are missing or null', () => {
            expect(isValidTransition('CREATED')).toBe(false);
            expect(isValidTransition(null, 'QUEUED')).toBe(false);
            expect(isValidTransition(undefined, undefined)).toBe(false);
        });

        it('should handle non-string types gracefully', () => {
            expect(isValidTransition(123, 'QUEUED')).toBe(false);
            expect(isValidTransition('CREATED', {})).toBe(false);
        });
    });
});