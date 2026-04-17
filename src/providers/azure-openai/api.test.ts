import { Options } from '../../types/requestBody';
import { GatewayError } from '../../errors/GatewayError';

// Stub the env module: it uses top-level await which trips ts-jest's default
// CommonJS transform. getBaseURL never touches it at runtime.
jest.mock('../../utils/env', () => ({
  Environment: () => ({}),
  getValueOrFileContents: (v: any) => v,
}));

import AzureOpenAIAPIConfig from './api';

// Thin wrapper over the real provider config to keep tests focused on the
// URL construction logic. `getBaseURL` for Azure only consumes providerOptions,
// so the other ProviderAPIConfig args can be omitted for these tests.
const callGetBaseURL = (providerOptions: Partial<Options>): string =>
  AzureOpenAIAPIConfig.getBaseURL({
    providerOptions: providerOptions as Options,
  } as any) as string;

describe('Azure OpenAI getBaseURL', () => {
  describe('valid resource names', () => {
    it('builds the Azure hostname from a simple resource name', () => {
      expect(callGetBaseURL({ resourceName: 'my-resource' })).toBe(
        'https://my-resource.openai.azure.com/openai'
      );
    });

    it('accepts alphanumeric resource names', () => {
      expect(callGetBaseURL({ resourceName: 'resource123' })).toBe(
        'https://resource123.openai.azure.com/openai'
      );
    });

    it('accepts resource names with dots', () => {
      expect(callGetBaseURL({ resourceName: 'my.resource' })).toBe(
        'https://my.resource.openai.azure.com/openai'
      );
    });
  });

  describe('SSRF prevention via URL fragment injection', () => {
    it('rejects resource name containing # (hostname hijacking via fragment)', () => {
      expect(() => callGetBaseURL({ resourceName: 'evil.com#' })).toThrow(
        GatewayError
      );
    });

    it('rejects resource name containing / (path injection)', () => {
      expect(() => callGetBaseURL({ resourceName: 'evil.com/' })).toThrow(
        GatewayError
      );
    });

    it('rejects resource name containing @ (userinfo injection)', () => {
      expect(() => callGetBaseURL({ resourceName: 'user@evil.com' })).toThrow(
        GatewayError
      );
    });

    it('rejects resource name containing ? (query injection)', () => {
      expect(() =>
        callGetBaseURL({ resourceName: 'evil.com?redirect=true' })
      ).toThrow(GatewayError);
    });

    it('rejects resource name targeting the cloud metadata endpoint', () => {
      expect(() =>
        callGetBaseURL({ resourceName: '169.254.169.254#' })
      ).toThrow(GatewayError);
    });

    it('rejects resource name with whitespace', () => {
      expect(() => callGetBaseURL({ resourceName: 'evil com' })).toThrow(
        GatewayError
      );
    });

    it('throws 400 on rejection (not 500)', () => {
      try {
        callGetBaseURL({ resourceName: 'evil.com#' });
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(GatewayError);
        expect((err as GatewayError).status).toBe(400);
      }
    });
  });

  describe('documents the attack vector the fix prevents', () => {
    // Regression lock: if the validation were removed, new URL() would resolve
    // the hostname to the attacker domain instead of Azure's.
    it('# character in a templated resource name hijacks the hostname', () => {
      const templated = `https://evil.com#.openai.azure.com/openai`;
      const parsed = new URL(templated);
      expect(parsed.hostname).toBe('evil.com');
      expect(parsed.hash).toBe('#.openai.azure.com/openai');
    });

    it('/ character in a templated resource name hijacks the hostname', () => {
      const templated = `https://evil.com/.openai.azure.com/openai`;
      const parsed = new URL(templated);
      expect(parsed.hostname).toBe('evil.com');
    });
  });
});
