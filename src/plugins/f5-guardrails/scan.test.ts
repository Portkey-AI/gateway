import { handler } from './scan';
import testCreds from './.creds.json';
import {
  mockPluginHandlerOptions,
  createChatCompleteRequestContext,
} from '../testUtils';

describe('f5GuardrailsScan', () => {
  const nricRequestContext = createChatCompleteRequestContext(
    'My NRIC is S1234567A'
  );

  it('Should mask the NRIC if it is detected', async () => {
    const result = await handler(
      nricRequestContext,
      {
        credentials: {
          apiKey: testCreds.apiKey,
        },
        projectId: testCreds.projectId,
        redact: false,
      },
      'beforeRequestHook',
      mockPluginHandlerOptions
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data?.[0].redactedInput).toBe('My NRIC is *********');
  });

  it('Should return verdict true if redact is true', async () => {
    const result = await handler(
      nricRequestContext,
      {
        credentials: {
          apiKey: testCreds.apiKey,
        },
        projectId: testCreds.projectId,
        redact: true,
      },
      'beforeRequestHook',
      mockPluginHandlerOptions
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data?.[0].redactedInput).toBe('My NRIC is *********');
  });
});
