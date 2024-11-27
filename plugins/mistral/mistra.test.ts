import { PluginContext } from '../types';
import testCreds from './.creds.json';
import { mistralGuardrailHandler } from './index';

function getParameters() {
  return {
    credentials: testCreds,
  };
}

describe('mistral guardrail handler', () => {
  it('should fail if the apiKey is invalid', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: { text: 'this is a test string for moderations' },
    };
    const parameters = JSON.parse(JSON.stringify(getParameters()));
    parameters.credentials.apiKey = 'invalid-api-key';

    const result = await mistralGuardrailHandler(
      context as unknown as PluginContext,
      parameters,
      eventType,
      { env: {} },
      'pii'
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
  });

  it('should return pii true for pii function', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Say Hi. My name is Jhon Doe and my email is user@example.com',
      },
    };
    const parameters = JSON.parse(JSON.stringify(getParameters()));

    const result = await mistralGuardrailHandler(
      context as unknown as PluginContext,
      parameters,
      eventType,
      { env: {} },
      'pii'
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it('should be false when pii is not present', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: { text: 'this text is safe text' },
    };
    const parameters = JSON.parse(JSON.stringify(getParameters()));

    const result = await mistralGuardrailHandler(
      context as unknown as PluginContext,
      parameters,
      eventType,
      { env: {} },
      'pii'
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it('should work pii for chatComplete messages', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      requestType: 'chatComplete',
      request: {
        json: {
          messages: [
            {
              role: 'user',
              content:
                'Say Hi. My name is Jhon Doe and my email is user@example.com',
            },
          ],
        },
      },
    };
    const parameters = JSON.parse(JSON.stringify(getParameters()));

    const result = await mistralGuardrailHandler(
      context as unknown as PluginContext,
      parameters,
      eventType,
      { env: {} },
      'pii'
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it('should give error on invalid request body', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {},
    };
    const parameters = JSON.parse(JSON.stringify(getParameters()));

    const result = await mistralGuardrailHandler(
      context as unknown as PluginContext,
      parameters,
      eventType,
      { env: {} },
      'pii'
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBe('Mistral: Invalid Request body');
    expect(result.data).toBeNull();
  });

  it('should work for afterRequestHook', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      response: { text: 'this text is safe text' },
    };
    const parameters = JSON.parse(JSON.stringify(getParameters()));

    const result = await mistralGuardrailHandler(
      context as unknown as PluginContext,
      parameters,
      eventType,
      { env: {} },
      'pii'
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it('should work for afterRequestHook with chatCompletion messages', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      requestType: 'chatComplete',
      response: {
        json: {
          messages: [
            {
              role: 'user',
              content:
                'Say Hi. My name is Jhon Doe and my email is user@example.com',
            },
          ],
        },
      },
    };
    const parameters = JSON.parse(JSON.stringify(getParameters()));

    const result = await mistralGuardrailHandler(
      context as unknown as PluginContext,
      parameters,
      eventType,
      { env: {} },
      'pii'
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });
});
