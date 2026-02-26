/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          skipLibCheck: true,
          lib: ['ESNext'],
          resolveJsonModule: true,
        },
      },
    ],
  },
  testTimeout: 30000, // Set default timeout to 30 seconds
};
