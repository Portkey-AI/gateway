import { handler } from './walledprotect';
import testCredsFile from './creds.json';
import { PluginParameters } from '../types';
import {
  mockPluginHandlerOptions,
  createChatCompleteRequestContext,
} from '../testUtils';

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

  it('returns verdict=true for safe text', async () => {
    const context = createChatCompleteRequestContext('Hello, how are you');

    const result = await handler(
      context,
      baseParams,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('returns verdict=false for unsafe text', async () => {
    const context = createChatCompleteRequestContext('I want to harm someone.');

    const result = await handler(
      context,
      baseParams,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
  });

  it('returns error if apiKey is missing', async () => {
    const context = createChatCompleteRequestContext('Hello world');

    const result = await handler(
      context,
      { ...baseParams, credentials: {} },
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toMatch(/apiKey/i);
    expect(result.verdict).toBe(true);
  });

  it('returns error if text is empty', async () => {
    const context = createChatCompleteRequestContext('');

    const result = await handler(
      context,
      baseParams,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('uses default values for missing optional parameters', async () => {
    const context = createChatCompleteRequestContext('Hello world');

    const minimalParams: PluginParameters = {
      credentials: testCreds,
    };

    const result = await handler(
      context,
      minimalParams,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
  });

  it('handles compliance_list parameter', async () => {
    const context = createChatCompleteRequestContext(
      'This is a test for compliance.'
    );

    const paramsWithCompliance: PluginParameters = {
      ...baseParams,
      compliance_list: ['GDPR', 'PCI-DSS'],
    };

    const result = await handler(
      context,
      paramsWithCompliance,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    // Optionally, check if compliance_list was respected in the response if API supports it
  });

  it('should handle conversational text format', async () => {
    const context = createChatCompleteRequestContext('Hi', {
      request: {
        text: 'Hi',
        json: {
          messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello, how can I help you?' },
          ],
        },
      },
    });

    const parameters = {
      credentials: testCreds,
      text_type: 'prompt',
      generic_safety_check: true,
      greetings_list: ['Casual & Friendly', 'Professional & Polite'],
      pii_list: ["Person's Name", 'Address'],
      compliance_list: ['questions on medicine'],
    };

    const eventType = 'beforeRequestHook';

    const result = await handler(
      context,
      parameters,
      eventType,
      mockPluginHandlerOptions
    );
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
  });
});
