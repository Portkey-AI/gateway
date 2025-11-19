import { handler } from './scan';
import testCreds from './.creds.json';
import { PluginContext } from '../types';

describe('f5GuardrailsScan', () => {
  it('Should mask the NRIC if it is detected', async () => {
    const context = {
      request: {
        text: 'My NRIC is S1234567A',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My NRIC is S1234567A',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const result = await handler(
      context as PluginContext,
      {
        credentials: {
          apiKey: testCreds.apiKey,
        },
        projectId: testCreds.projectId,
        redact: false,
      },
      'beforeRequestHook'
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data?.[0].redactedInput).toBe('My NRIC is *********');
  });

  it('Should return verdict true if redact is true', async () => {
    const context = {
      request: {
        text: 'My NRIC is S1234567A',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My NRIC is S1234567A',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const result = await handler(
      context as PluginContext,
      {
        credentials: {
          apiKey: testCreds.apiKey,
        },
        projectId: testCreds.projectId,
        redact: true,
      },
      'beforeRequestHook'
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data?.[0].redactedInput).toBe('My NRIC is *********');
  });
});
