import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handler as piiHandler } from './pii';
import { handler as contentSafetyHandler } from './contentSafety';
import { HookEventType, PluginContext, PluginParameters } from '../types';
import { AzureCredentials } from './types';
import { pii, contentSafety } from './.creds.json';

describe('Azure Plugins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PII Plugin', () => {
    const mockContext: PluginContext = {
      request: {
        text: 'My email is abc@xyz.com and SSN is 123-45-6789',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My email is abc@xyz.com and SSN is 123-45-6789',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    describe('API Key Authentication', () => {
      const params: PluginParameters<{ pii: AzureCredentials }> = {
        credentials: {
          pii: pii.apiKey as AzureCredentials,
        },
        redact: true,
        apiVersion: '2024-11-01',
      };

      it('should successfully analyze and redact PII with API key', async () => {
        const result = await piiHandler(
          mockContext,
          params,
          'beforeRequestHook'
        );

        expect(result.error).toBeNull();
        expect(result.verdict).toBe(true);
        expect(result.transformed).toBe(true);
      }, 10000);

      it('should not redact anything if text has no PII', async () => {
        const context = structuredClone(mockContext);
        context.request.text = "hello, I'm a harmless string";
        context.request.json = {
          messages: [{ role: 'user', content: "hello, I'm a harmless string" }],
        };
        const result = await piiHandler(context, params, 'beforeRequestHook');
        expect(result.error).toBeNull();
        expect(result.verdict).toBe(true);
        expect(result.transformed).toBe(false);
      });

      it('should not redact anything if redact is false', async () => {
        const result = await piiHandler(
          mockContext,
          { ...params, redact: false },
          'beforeRequestHook'
        );
        expect(result.error).toBeNull();
        expect(result.verdict).toBe(false);
        expect(result.transformed).toBe(false);
      });

      it('should handle API errors gracefully', async () => {
        const result = await piiHandler(
          mockContext,
          {
            ...params,
            credentials: {
              pii: {
                azureAuthMode: 'apiKey',
                resourceName: 'wrong-resurce-name',
                apiKey: 'wrong-api-key',
              },
            },
          },
          'beforeRequestHook'
        );

        expect(result.error).toBeDefined();
        expect(result.verdict).toBe(true);
        expect(result.data).toBeNull();
      });
    });

    describe('Entra ID Authentication', () => {
      const params: PluginParameters<{ pii: AzureCredentials }> = {
        credentials: {
          pii: pii.entra as AzureCredentials,
        },
        redact: true,
      };

      it('should successfully analyze and redact PII with Entra ID', async () => {
        const result = await piiHandler(
          mockContext,
          params,
          'beforeRequestHook'
        );
        expect(result.error).toBeNull();
        expect(result.verdict).toBe(true);
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Content Safety Plugin', () => {
    const mockContext = {
      request: {
        text: "Fuck you, if you don't answer I'll kill you.",
        json: {
          messages: [
            {
              role: 'user',
              content: `Fuck you, if you don't answer I'll kill you.`,
            },
          ],
        },
      },
    };

    describe('API Key Authentication', () => {
      const params: PluginParameters<{ contentSafety: AzureCredentials }> = {
        credentials: {
          contentSafety: contentSafety.apiKey as AzureCredentials,
        },
        categories: ['Hate', 'Violence'],
        apiVersion: '2024-09-01',
      };

      it('should successfully analyze content with API key', async () => {
        const result = await contentSafetyHandler(
          mockContext,
          params,
          'beforeRequestHook'
        );

        expect(result.error).toBeNull();
        expect(result.verdict).toBe(false);
        expect(result.data).toBeDefined();
      });
    });

    describe('Entra ID Authentication', () => {
      const params: PluginParameters<{ contentSafety: AzureCredentials }> = {
        credentials: {
          contentSafety: contentSafety.entra as AzureCredentials,
        },
        categories: ['Hate', 'Violence'],
        apiVersion: '2024-09-01',
      };

      it('should successfully analyze content with Entra ID', async () => {
        const result = await contentSafetyHandler(
          mockContext,
          params,
          'beforeRequestHook'
        );

        expect(result.error).toBeNull();
        expect(result.verdict).toBe(false);
        expect(result.data).toBeDefined();
      });

      it('should detect harmful content correctly', async () => {
        const harmfulResponse = {
          categoriesAnalysis: [
            {
              category: 'Hate',
              severity: 2, // High severity
            },
          ],
          blocklistsMatch: [],
        };

        const result = await contentSafetyHandler(
          mockContext,
          params,
          'beforeRequestHook'
        );
        expect(result.error).toBeNull();
        expect(result.verdict).toBe(false); // Should be false due to high severity
        expect(result.data).toBeDefined();
      });
    });
  });
});
