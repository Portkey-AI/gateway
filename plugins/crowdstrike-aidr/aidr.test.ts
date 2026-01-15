import { handler } from './guardChatCompletion';
import testCredsFile from './.creds.json';
import { HookEventType, PluginContext } from '../types';

const options = {
  env: {},
};

const testCreds = {
  baseUrl: testCredsFile.baseUrl,
  blockApiKey: testCredsFile.blockApiKey,
  redactApiKey: testCredsFile.redactApiKey,
};

describe('AIDR Handlers', () => {
  it('should return an error if hook type is not supported', async () => {
    const context = {
      request: { text: 'This is a message' },
    };
    const eventType = 'unsupported';
    const parameters = {};
    const result = await handler(
      context,
      parameters,
      // @ts-ignore
      eventType,
      options
    );
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return an error if fetch request fails', async () => {
    const context = {
      request: { text: 'This is a message' },
    };
    const eventType = 'beforeRequestHook';
    const parameters = {
      credentials: {},
    };
    const result = await handler(context, parameters, eventType, options);
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return an error if no apiKey', async () => {
    const context = {
      request: { text: 'This is a message' },
    };
    const eventType = 'beforeRequestHook';
    const parameters = {
      credentials: { baseUrl: testCreds.baseUrl },
    };
    const result = await handler(context, parameters, eventType, options);
    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return verdict as false if blocked', async () => {
    const context = {
      request: {
        json: {
          messages: [
            {
              role: 'user',
              content:
                'My email is john.smith@crowdstrike.com and my IP address is 200.0.16.24',
            },
          ],
        },
      },
    };
    const eventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        baseUrl: testCreds.baseUrl,
        apiKey: testCreds.blockApiKey,
      },
    };
    const result = await handler(context, parameters, eventType, options);
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
  });

  it('should return transformation', async () => {
    const origMsg =
      'My email is john.smith@crowdstrike.com and my IP address is 200.0.16.24';
    const context = {
      request: {
        json: {
          messages: [
            {
              role: 'user',
              content: origMsg,
            },
          ],
        },
      },
    };
    const eventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        baseUrl: testCreds.baseUrl,
        apiKey: testCreds.redactApiKey,
      },
    };
    const result = await handler(context, parameters, eventType, options);
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(result.transformedData).toBeDefined();
    expect(result.transformedData?.request?.json?.messages.length).toBe(1);
    expect(result.transformedData.request.json.messages[0].content).not.toBe(
      origMsg
    );
  });
});
