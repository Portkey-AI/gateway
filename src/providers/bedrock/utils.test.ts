import { GatewayError } from '../../errors/GatewayError';

// Stub the env module: it uses top-level await which trips ts-jest's default
// CommonJS transform. Our test validates that STS URL construction rejects a
// malicious region before any env access.
jest.mock('../../utils/env', () => ({
  Environment: () => ({}),
  getValueOrFileContents: (v: any) => v,
}));

import { getAssumedRoleCredentials } from './utils';

describe('Bedrock getAssumedRoleCredentials', () => {
  const stubContext = { get: () => undefined } as any;

  it('rejects a region containing # before constructing the STS URL', async () => {
    await expect(
      getAssumedRoleCredentials(
        stubContext,
        'arn:aws:iam::123:role/Foo',
        'ext',
        'evil.com#'
      )
    ).rejects.toThrow(GatewayError);
  });

  it('rejects a region containing /', async () => {
    await expect(
      getAssumedRoleCredentials(
        stubContext,
        'arn:aws:iam::123:role/Foo',
        'ext',
        'evil/'
      )
    ).rejects.toThrow(GatewayError);
  });

  it('rejects a region containing @', async () => {
    await expect(
      getAssumedRoleCredentials(
        stubContext,
        'arn:aws:iam::123:role/Foo',
        'ext',
        'user@evil.com'
      )
    ).rejects.toThrow(GatewayError);
  });
});
