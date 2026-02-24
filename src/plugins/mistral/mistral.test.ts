import testCreds from './.creds.json';
import { mistralGuardrailHandler } from './index';
import {
  mockPluginHandlerOptions,
  createChatCompleteRequestContext,
} from '../testUtils';

function getParameters() {
  return {
    credentials: testCreds,
  };
}

describe('mistral guardrail handler', () => {
  it('should fail if the apiKey is invalid', async () => {
    const context = createChatCompleteRequestContext(
      'this is a test string for moderations'
    );
    const parameters = JSON.parse(JSON.stringify(getParameters()));
    parameters.credentials.apiKey = 'invalid-api-key';

    const result = await mistralGuardrailHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
  });

  it('should success and return the flagged categories', async () => {
    const context = createChatCompleteRequestContext(
      'my name is John Doe and my email is john.doe@example.com'
    );
    const parameters = JSON.parse(JSON.stringify(getParameters()));
    parameters.categories = ['pii'];

    const result = await mistralGuardrailHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data).toMatchObject({ flagged_categories: ['pii'] });
  });

  it('should include the multiple flagged categories in the response', async () => {
    const context = createChatCompleteRequestContext(
      'my name is John Doe and my email is john.doe@example.com. I am a financial advisor and I suggest you to invest in the stock market in company A.'
    );
    const parameters = JSON.parse(JSON.stringify(getParameters()));
    parameters.categories = ['pii', 'financial'];

    const result = await mistralGuardrailHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data).toMatchObject({
      flagged_categories: ['financial', 'pii'],
    });
  });

  it('should fail if the request body is invalid', async () => {
    const context = createChatCompleteRequestContext(
      'this is safe string without any flagged categories'
    );

    const parameters = JSON.parse(JSON.stringify(getParameters()));
    parameters.categories = ['pii', 'financial'];

    const result = await mistralGuardrailHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
  });
});
