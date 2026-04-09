import { handler as scanHandler } from './scan';
import { handler as redactHandler } from './redact';
import { HookEventType, PluginContext } from '../types';

const options = { env: {} };

describe('promptguard scan handler', () => {
  it('should return error if no API key', async () => {
    const context = {
      request: { text: 'Hello world' },
    };
    const parameters = {};
    const result = await scanHandler(
      context,
      parameters,
      'beforeRequestHook',
      options
    );
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return error if text is empty', async () => {
    const context = {
      request: { text: '' },
    };
    const parameters = {
      credentials: { apiKey: 'pg_live_test_key' },
    };
    const result = await scanHandler(
      context,
      parameters,
      'beforeRequestHook',
      options
    );
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return error if credentials are empty object', async () => {
    const context = {
      request: { text: 'Hello world' },
    };
    const parameters = {
      credentials: {},
    };
    const result = await scanHandler(
      context,
      parameters,
      'beforeRequestHook',
      options
    );
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe('promptguard redact handler', () => {
  it('should return error if no API key', async () => {
    const context = {
      request: {
        text: 'My email is test@example.com',
        json: {
          messages: [{ role: 'user', content: 'My email is test@example.com' }],
        },
      },
      requestType: 'chatComplete',
    } as PluginContext;
    const parameters = {};
    const result = await redactHandler(
      context,
      parameters,
      'beforeRequestHook',
      options
    );
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return error for embed requests with redaction', async () => {
    const context = {
      request: {
        text: 'My email is test@example.com',
        json: { input: 'My email is test@example.com' },
      },
      requestType: 'embed',
    } as PluginContext;
    const parameters = {
      redact: true,
      credentials: { apiKey: 'pg_live_test_key' },
    };
    const result = await redactHandler(
      context,
      parameters,
      'beforeRequestHook',
      options
    );
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return error if content is empty', async () => {
    const context = {
      request: {
        json: null,
      },
      requestType: 'chatComplete',
    } as PluginContext;
    const parameters = {
      credentials: { apiKey: 'pg_live_test_key' },
    };
    const result = await redactHandler(
      context,
      parameters,
      'beforeRequestHook',
      options
    );
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return error if credentials are empty object', async () => {
    const context = {
      request: {
        text: 'My email is test@example.com',
        json: {
          messages: [{ role: 'user', content: 'My email is test@example.com' }],
        },
      },
      requestType: 'chatComplete',
    } as PluginContext;
    const parameters = {
      credentials: {},
    };
    const result = await redactHandler(
      context,
      parameters,
      'beforeRequestHook',
      options
    );
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });
});
