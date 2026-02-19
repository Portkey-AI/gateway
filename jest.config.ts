export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|js)$': [
      'ts-jest',
      {
        tsconfig: {
          // Allow importing JSON files
          resolveJsonModule: true,
          // Support ESM and top-level await
          module: 'ESNext',
          target: 'ES2020',
        },
        isolatedModules: true,
        diagnostics: {
          ignoreCodes: [151002, 1378],
        },
      },
    ],
  },
  transformIgnorePatterns: [
    // Transform ES modules: jose, node-fetch and all its dependencies
    // Match these packages at any nesting level (including nested node_modules)
    // The pattern matches: node_modules/.../package-name/ or node_modules/package-name/
    '/node_modules/(?!.*(jose|node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill|form-data|whatwg-url|tr46|webidl-conversions|abab)/)',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/__tests__/**/test.[jt]s?(x)',
    '**/*.test.[jt]s?(x)',
  ],
};
