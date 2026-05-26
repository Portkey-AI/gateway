import { GatewayError } from '../../errors/GatewayError';

jest.mock('../../utils/env', () => ({
  Environment: () => ({}),
  getValueOrFileContents: (v: any) => v,
}));

import { GoogleRetrieveFileRequestHandler } from './retrieveFile';

describe('GoogleRetrieveFileRequestHandler', () => {
  const baseArgs = {
    providerOptions: {} as any,
    requestBody: {} as any,
    requestHeaders: {},
    c: {} as any,
  };

  // The fileId is the last path segment; it's decoded into `bucket/file`. A
  // malicious fileId like `evil.com%23/x` decodes to `evil.com#/x`, giving
  // bucket=`evil.com#` which would hijack the GCS hostname without validation.
  it('rejects a fileId whose bucket portion contains #', async () => {
    await expect(
      GoogleRetrieveFileRequestHandler({
        ...baseArgs,
        requestURL: 'https://gateway.example/v1/files/evil.com%23%2Ffoo',
      })
    ).rejects.toThrow(GatewayError);
  });

  it('rejects a fileId whose bucket portion contains @', async () => {
    await expect(
      GoogleRetrieveFileRequestHandler({
        ...baseArgs,
        requestURL: 'https://gateway.example/v1/files/user%40evil.com%2Ffoo',
      })
    ).rejects.toThrow(GatewayError);
  });
});
