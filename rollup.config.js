import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/start-server.ts',
  output: {
    dir: 'build',
    format: 'es'
  },
  plugins: [typescript(), terser()]
};