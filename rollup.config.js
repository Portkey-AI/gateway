import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';

export default {
  input: {
    'start-server': 'src/start-server.ts',
    app: 'src/app-entry.ts',
  },
  output: {
    dir: 'build',
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
  },
  plugins: [
    typescript({
      exclude: ['**/*.test.ts', 'start-test.js', 'cookbook', 'docs', 'tests'],
      declaration: true,
      declarationDir: 'build/types',
    }),
    terser(),
    json(),
    copy({
      targets: [{ src: 'src/public/*', dest: 'build/public' }],
    }),
  ],
};
