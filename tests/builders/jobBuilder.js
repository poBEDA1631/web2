const defaults = {
    sourceUrl: 'http://test.com/fixture.jpg',
    type:      'blur',
    userId:    'test-user-1',
};

/**
 * Builds a job fixture with deterministic defaults.
 * Adheres strictly to Section 5 & 6.2 of the Test Strategy.
 */
const buildJob = (overrides = {}) => ({ ...defaults, ...overrides });

module.exports = { buildJob };
