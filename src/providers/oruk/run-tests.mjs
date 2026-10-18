import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const checkout = resolve(here, '../../..');
const require = createRequire(import.meta.url);
const temporaryDirectory = await mkdtemp(
  join(checkout, '.oruk-provider-tests-')
);
const outfile = join(temporaryDirectory, 'oruk.review.test.mjs');
let status = 1;

try {
  await build({
    absWorkingDir: checkout,
    entryPoints: [join(here, 'oruk.test.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  });

  const config = {
    rootDir: checkout,
    testEnvironment: 'node',
    transform: {},
    testRegex: 'oruk\\.review\\.test\\.mjs$',
    testTimeout: 30000,
  };
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      require.resolve('jest/bin/jest'),
      '--runInBand',
      '--runTestsByPath',
      outfile,
      '--config',
      JSON.stringify(config),
    ],
    { cwd: checkout, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

process.exitCode = status;
