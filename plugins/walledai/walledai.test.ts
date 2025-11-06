import { handler } from './walledprotect';
import testCredsFile from './creds.json';
import { HookEventType, PluginContext, PluginParameters } from '../types';

const testCreds = {
  apiKey: testCredsFile.apiKey,
};

describe('WalledAI Guardrail Plugin Handler (integration)', () => {
  const baseParams: PluginParameters = {
    credentials: testCreds,
    text_type: 'prompt',
    generic_safety_check: true,
    greetings_list: ['Casual & Friendly', 'Professional & Polite'],
    pii_list: ["Person's Name", 'Address'],
    compliance_list: ['questions on medicine'],
  };

  const makeContext = (text: string): PluginContext => ({
    requestType: 'chatComplete',
    request: {
      json: {
        messages: [{ role: 'user', content: text }],
      },
    },
    response: {},
  });

  it('returns verdict=true for safe text', async () => {
    const context = makeContext('Hello, how are you');

    const result = await handler(context, baseParams, 'beforeRequestHook');

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('returns verdict=false for unsafe text', async () => {
    const context = makeContext('I want to harm someone.');

    const result = await handler(context, baseParams, 'beforeRequestHook');

    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
  });

  it('returns error if apiKey is missing', async () => {
    const context = makeContext('Hello world');

    const result = await handler(
      context,
      { ...baseParams, credentials: {} },
      'beforeRequestHook'
    );

    expect(result.error).toMatch(/apiKey/i);
    expect(result.verdict).toBe(true);
  });

  it('returns error if text is empty', async () => {
    const context = makeContext('');

    const result = await handler(context, baseParams, 'beforeRequestHook');

    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('uses default values for missing optional parameters', async () => {
    const context = makeContext('Hello world');

    const minimalParams: PluginParameters = {
      credentials: testCreds,
    };

    const result = await handler(context, minimalParams, 'beforeRequestHook');

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
  });

  it('handles compliance_list parameter', async () => {
    const context = makeContext('This is a test for compliance.');

    const paramsWithCompliance: PluginParameters = {
      ...baseParams,
      compliance_list: ['GDPR', 'PCI-DSS'],
    };

    const result = await handler(
      context,
      paramsWithCompliance,
      'beforeRequestHook'
    );

    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    // Optionally, check if compliance_list was respected in the response if API supports it
  });

  it('should handle conversational text format', async () => {
    const context = {
      requestType: 'chatComplete',
      request: {
        json: {
          messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello, how can I help you?' },
          ],
        },
      },
      response: {},
    };

    const parameters = {
      credentials: testCreds,
      text_type: 'prompt',
      generic_safety_check: true,
      greetings_list: ['Casual & Friendly', 'Professional & Polite'],
      pii_list: ["Person's Name", 'Address'],
      compliance_list: ['questions on medicine'],
    };

    const eventType = 'beforeRequestHook';

    const result = await handler(context as any, parameters, eventType);
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
  });
});
