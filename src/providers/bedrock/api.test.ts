import { Options, Params } from '../../types/requestBody';
import { GatewayError } from '../../errors/GatewayError';

// Stub the env module: it uses top-level await which trips ts-jest's default
// CommonJS transform. Our tests validate SSRF protection on getBaseURL, which
// throws before any env access.
jest.mock('../../utils/env', () => ({
  Environment: () => ({}),
  getValueOrFileContents: (v: any) => v,
}));

import BedrockAPIConfig from './api';

type BaseURLArgs = Parameters<typeof BedrockAPIConfig.getBaseURL>[0];

const callGetBaseURL = (
  providerOptions: Partial<Options>,
  fn: string = 'chatComplete',
  gatewayRequestURL: string = 'https://gateway.example/v1/chat/completions',
  params?: Partial<Params>
) =>
  BedrockAPIConfig.getBaseURL({
    c: {} as any,
    providerOptions: providerOptions as Options,
    fn,
    gatewayRequestURL,
    params: (params ?? {}) as Params,
  } as unknown as BaseURLArgs) as Promise<string>;

describe('Bedrock getBaseURL', () => {
  describe('SSRF prevention on awsRegion', () => {
    it('rejects awsRegion containing # (hostname hijacking)', async () => {
      await expect(callGetBaseURL({ awsRegion: 'evil.com#' })).rejects.toThrow(
        GatewayError
      );
    });

    it('rejects awsRegion containing /', async () => {
      await expect(callGetBaseURL({ awsRegion: 'us-east-1/' })).rejects.toThrow(
        GatewayError
      );
    });

    it('rejects awsRegion targeting the metadata endpoint', async () => {
      await expect(
        callGetBaseURL({ awsRegion: '169.254.169.254#' })
      ).rejects.toThrow(GatewayError);
    });
  });

  describe('SSRF prevention on awsS3Bucket (uploadFile path)', () => {
    it('rejects awsS3Bucket containing #', async () => {
      await expect(
        callGetBaseURL(
          { awsRegion: 'us-east-1', awsS3Bucket: 'evil.com#' },
          'uploadFile'
        )
      ).rejects.toThrow(GatewayError);
    });

    it('rejects awsS3Bucket containing @', async () => {
      await expect(
        callGetBaseURL(
          { awsRegion: 'us-east-1', awsS3Bucket: 'user@evil.com' },
          'uploadFile'
        )
      ).rejects.toThrow(GatewayError);
    });
  });

  describe('SSRF prevention on bucket name parsed from request path', () => {
    it('rejects a # in the s3:// URI extracted from /v1/files/', async () => {
      await expect(
        callGetBaseURL(
          { awsRegion: 'us-east-1' },
          'retrieveFile',
          'https://gateway.example/v1/files/s3://evil.com%23/object'
        )
      ).rejects.toThrow(GatewayError);
    });

    it('rejects a @ in the s3:// URI for retrieveFileContent', async () => {
      await expect(
        callGetBaseURL(
          { awsRegion: 'us-east-1' },
          'retrieveFileContent',
          'https://gateway.example/v1/files/s3://user%40evil.com/object'
        )
      ).rejects.toThrow(GatewayError);
    });
  });
});
