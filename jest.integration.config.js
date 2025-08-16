/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': ['ts-jest', {}],
  },
  testTimeout: 30000, // Set default timeout to 30 seconds
  // Only run integration tests
  testMatch: [
    '**/tests/integration/**/*.test.ts',
    '**/tests/integration/**/*.test.js',
  ],
};
