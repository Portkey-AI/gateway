/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': [
      'ts-jest',
      {
        // Suppress pre-existing type errors in unrelated provider files
        // (e.g., bytez/api.ts TS2339, env.ts TS1378) so they don't block test compilation.
        diagnostics: {
          ignoreCodes: [2339, 1378],
        },
      },
    ],
  },
  testTimeout: 30000, // Set default timeout to 30 seconds
};
