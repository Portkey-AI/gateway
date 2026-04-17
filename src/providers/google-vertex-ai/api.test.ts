import { Options, Params } from '../../types/requestBody';
import { GatewayError } from '../../errors/GatewayError';
import { GoogleApiConfig } from './api';

type BaseURLArgs = Parameters<typeof GoogleApiConfig.getBaseURL>[0];
type EndpointArgs = Parameters<typeof GoogleApiConfig.getEndpoint>[0];

const callGetBaseURL = (
  providerOptions: Partial<Options>,
  fn: string = 'chatComplete'
): string =>
  GoogleApiConfig.getBaseURL({
    providerOptions: providerOptions as Options,
    fn,
  } as unknown as BaseURLArgs) as string;

const callGetEndpoint = (
  providerOptions: Partial<Options>,
  body: Partial<Params>,
  fn: string = 'chatComplete',
  gatewayRequestURL: string = 'https://gateway.example/v1/chat/completions'
): string =>
  GoogleApiConfig.getEndpoint({
    providerOptions: providerOptions as Options,
    fn,
    gatewayRequestBodyJSON: body as Params,
    gatewayRequestURL,
  } as unknown as EndpointArgs) as string;

describe('Vertex AI getBaseURL', () => {
  describe('valid regions', () => {
    it('builds the regional Vertex hostname', () => {
      expect(callGetBaseURL({ vertexRegion: 'us-central1' })).toBe(
        'https://us-central1-aiplatform.googleapis.com'
      );
    });

    it('uses the global aiplatform endpoint when region is "global"', () => {
      expect(callGetBaseURL({ vertexRegion: 'global' })).toBe(
        'https://aiplatform.googleapis.com'
      );
    });

    it('accepts other regions', () => {
      expect(callGetBaseURL({ vertexRegion: 'europe-west1' })).toBe(
        'https://europe-west1-aiplatform.googleapis.com'
      );
    });
  });

  describe('SSRF prevention via URL fragment injection', () => {
    it('rejects region containing # (hostname hijacking)', () => {
      expect(() => callGetBaseURL({ vertexRegion: 'evil.com#' })).toThrow(
        GatewayError
      );
    });

    it('rejects region containing /', () => {
      expect(() => callGetBaseURL({ vertexRegion: 'evil.com/' })).toThrow(
        GatewayError
      );
    });

    it('rejects region targeting the cloud metadata endpoint', () => {
      expect(() =>
        callGetBaseURL({ vertexRegion: '169.254.169.254#' })
      ).toThrow(GatewayError);
    });
  });
});

describe('Vertex AI getEndpoint', () => {
  describe('inference endpoints', () => {
    it('builds a chat completion path from valid inputs', () => {
      expect(
        callGetEndpoint(
          { vertexProjectId: 'my-project-123', vertexRegion: 'us-central1' },
          { model: 'google.gemini-pro' }
        )
      ).toContain('/v1/projects/my-project-123/locations/us-central1');
    });

    it('rejects a malicious project ID on the inference path', () => {
      expect(() =>
        callGetEndpoint(
          { vertexProjectId: '../../admin', vertexRegion: 'us-central1' },
          { model: 'google.gemini-pro' }
        )
      ).toThrow(GatewayError);
    });

    it('rejects a malicious region on the inference path', () => {
      expect(() =>
        callGetEndpoint(
          { vertexProjectId: 'my-project', vertexRegion: 'evil#' },
          { model: 'google.gemini-pro' }
        )
      ).toThrow(GatewayError);
    });
  });

  describe('non-inference endpoints (batch/finetune)', () => {
    // These paths bypass getProjectRoute and previously had no validation.
    it('rejects a malicious project ID on the listBatches path', () => {
      expect(() =>
        callGetEndpoint(
          { vertexProjectId: '../../admin', vertexRegion: 'us-central1' },
          { model: 'google.gemini-pro' },
          'listBatches',
          'https://gateway.example/v1/batches'
        )
      ).toThrow(GatewayError);
    });

    it('rejects a malicious region on the createFinetune path', () => {
      expect(() =>
        callGetEndpoint(
          { vertexProjectId: 'my-project', vertexRegion: 'evil#' },
          { model: 'google.gemini-pro' },
          'createFinetune',
          'https://gateway.example/v1/fine_tuning/jobs'
        )
      ).toThrow(GatewayError);
    });

    it('builds a valid batch path from safe inputs', () => {
      const path = callGetEndpoint(
        { vertexProjectId: 'my-project', vertexRegion: 'us-central1' },
        { model: 'google.gemini-pro' },
        'createBatch',
        'https://gateway.example/v1/batches'
      );
      expect(path).toBe(
        '/v1/projects/my-project/locations/us-central1/batchPredictionJobs'
      );
    });
  });
});

describe('documents the attack vector the fix prevents', () => {
  it('# in region hijacks the hostname', () => {
    const templated = `https://evil.com#-aiplatform.googleapis.com`;
    const parsed = new URL(templated);
    expect(parsed.hostname).toBe('evil.com');
  });
});
