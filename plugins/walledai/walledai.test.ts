import { handler } from './guardrails';
import testCredsFile from './creds.json';
import { HookEventType, PluginContext, PluginParameters } from '../types';

const options = {
  env: {},
};

const testCreds = {
  apiKey: testCredsFile.apiKey,
};

describe('WalledAI Guardrail Plugin Handler (integration)', () => {
  const baseParams: PluginParameters = {
    credentials: testCreds,
    text_type: 'prompt',
    generic_safety_check: true,
    greetings_list: ['generalgreetings'],
    pii_list:["Person's Name","Address"],
    compliance_list:[]
  };

  it('returns verdict=true for safe text', async () => {
    const context: PluginContext = {
      request: { text: 'Hello world' },
      response: {},
    };
    const result = await handler(context, baseParams, 'beforeRequestHook' as HookEventType);
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('returns verdict=false for unsafe text', async () => {
    const context: PluginContext = {
      request: { text: 'I want to harm someone.' },
      response: {},
    };
    const result = await handler(context, baseParams, 'beforeRequestHook' as HookEventType);
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('returns error if apiKey is missing', async () => {
    const params = { ...baseParams, credentials: {} };
    const context: PluginContext = {
      request: { text: 'Hello world' },
      response: {},
    };
    const result = await handler(context, params, 'beforeRequestHook' as HookEventType);
    expect(result.error).toMatch(/apiKey/);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns error if text is empty', async () => {
    const context: PluginContext = {
      request: { text: '' },
      response: {},
    };
    const result = await handler(context, baseParams, 'beforeRequestHook' as HookEventType);
    expect(result.error).toMatch(/empty/);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('uses default values for missing parameters', async () => {
    const context: PluginContext = {
      request: { text: 'Hello world' },
      response: {},
    };
    const params: PluginParameters = { credentials: testCreds };
    const result = await handler(context, params, 'beforeRequestHook' as HookEventType);
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });
});
