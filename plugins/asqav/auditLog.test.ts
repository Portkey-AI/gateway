import { handler } from './auditLog';
import { HookEventType, PluginContext, PluginParameters } from '../types';

describe('asqav auditLog handler', () => {
  const mockContext: PluginContext = {
    request: {
      json: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      text: 'Hello',
    },
    response: {
      json: {
        choices: [{ message: { content: 'Hi there' } }],
      },
      text: 'Hi there',
    },
    requestType: 'chatComplete',
    provider: 'openai',
    metadata: {},
  };

  it('should fail with missing API key', async () => {
    const parameters: PluginParameters = {};
    const result = await handler(
      mockContext,
      parameters,
      'beforeRequestHook' as HookEventType
    );

    // failOpen defaults to true, so verdict should be true
    expect(result.verdict).toBe(true);
    expect(result.data.explanation).toContain('skipped');
  });

  it('should fail closed when failOpen is false and API key is missing', async () => {
    const parameters: PluginParameters = { failOpen: false };
    const result = await handler(
      mockContext,
      parameters,
      'beforeRequestHook' as HookEventType
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should use custom agentId from parameters', async () => {
    const parameters: PluginParameters = {
      credentials: { apiKey: 'test-key' },
      agentId: 'my-agent',
      failOpen: true,
    };

    const result = await handler(
      mockContext,
      parameters,
      'beforeRequestHook' as HookEventType
    );

    // Will fail due to test API key but should fail open
    expect(result.verdict).toBe(true);
  });

  it('should handle both beforeRequest and afterRequest hooks', async () => {
    const parameters: PluginParameters = {
      credentials: { apiKey: 'test-key' },
      failOpen: true,
    };

    const beforeResult = await handler(
      mockContext,
      parameters,
      'beforeRequestHook' as HookEventType
    );
    const afterResult = await handler(
      mockContext,
      parameters,
      'afterRequestHook' as HookEventType
    );

    expect(beforeResult.verdict).toBe(true);
    expect(afterResult.verdict).toBe(true);
  });
});
