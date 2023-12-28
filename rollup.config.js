import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/start-server.ts',
  output: {
    dir: 'build',
    format: 'es'
  },
  plugins: [typescript()]
};