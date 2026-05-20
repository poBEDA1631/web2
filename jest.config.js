module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'server.js'
  ],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ]
};
