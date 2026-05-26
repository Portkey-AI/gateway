import { handler } from './guardChatCompletion';
import testCredsFile from './.creds.json';
import * as utils from '../utils';

const options = {
  env: {},
};

const testCreds = {
  apiKey: testCredsFile.apiKey,
  baseUrl: testCredsFile.baseUrl,
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
      credentials: testCreds,
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
      credentials: testCreds,
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

describe('AIDR request body metadata', () => {
  const parameters = {
    credentials: {
      baseUrl: 'https://aidr.example.test',
      apiKey: 'test-key',
    },
  };

  let postSpy: jest.SpyInstance;

  beforeEach(() => {
    postSpy = jest.spyOn(utils, 'post').mockResolvedValue({
      status: 'Success',
      result: { blocked: false, transformed: false, policy: 'test-policy' },
    });
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  it('forwards user_id, user_name, llm_provider, and model when available', async () => {
    const context = {
      provider: 'openai',
      metadata: {
        _user: 'alice',
        _user_name: 'Alice Example',
      },
      request: {
        json: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'hello' }],
        },
      },
    };

    await handler(context, parameters, 'beforeRequestHook');

    expect(postSpy).toHaveBeenCalledTimes(1);
    const body = postSpy.mock.calls[0][1] as Record<string, any>;
    expect(body).toMatchObject({
      event_type: 'input',
      app_id: 'Portkey AI Gateway',
      user_id: 'alice',
      llm_provider: 'openai',
      model: 'gpt-4o-mini',
      extra_info: { user_name: 'Alice Example' },
    });
  });

  it('prefers _user/_user_name over user_id/user_name fallbacks', async () => {
    const context = {
      provider: 'anthropic',
      metadata: {
        _user: 'preferred-id',
        user_id: 'fallback-id',
        _user_name: 'Preferred Name',
        user_name: 'Fallback Name',
      },
      request: { json: { model: 'claude-3-5-sonnet', messages: [] } },
    };

    await handler(context, parameters, 'beforeRequestHook');

    const body = postSpy.mock.calls[0][1] as Record<string, any>;
    expect(body.user_id).toBe('preferred-id');
    expect(body.extra_info.user_name).toBe('Preferred Name');
  });

  it('falls back to user_id/user_name when underscore keys are missing', async () => {
    const context = {
      provider: 'openai',
      metadata: {
        user_id: 'bob',
        user_name: 'Bob Example',
      },
      request: { json: { model: 'gpt-4o', messages: [] } },
    };

    await handler(context, parameters, 'beforeRequestHook');

    const body = postSpy.mock.calls[0][1] as Record<string, any>;
    expect(body.user_id).toBe('bob');
    expect(body.extra_info.user_name).toBe('Bob Example');
  });

  it('omits metadata fields when no values are available', async () => {
    const context = {
      request: { json: { messages: [] } },
    };

    await handler(context, parameters, 'beforeRequestHook');

    const body = postSpy.mock.calls[0][1] as Record<string, any>;
    expect(body).toEqual({
      guard_input: { messages: [] },
      event_type: 'input',
      app_id: 'Portkey AI Gateway',
      extra_info: {},
    });
    expect(body).not.toHaveProperty('user_id');
    expect(body).not.toHaveProperty('llm_provider');
    expect(body).not.toHaveProperty('model');
  });

  it('uses output event_type for afterRequestHook and still includes metadata', async () => {
    const context = {
      provider: 'bedrock',
      metadata: { _user: 'charlie' },
      request: { json: { model: 'claude-3-haiku', messages: [] } },
      response: { json: { choices: [{ message: { content: 'hi' } }] } },
    };

    await handler(context, parameters, 'afterRequestHook');

    const body = postSpy.mock.calls[0][1] as Record<string, any>;
    expect(body.event_type).toBe('output');
    expect(body.user_id).toBe('charlie');
    expect(body.llm_provider).toBe('bedrock');
    expect(body.model).toBe('claude-3-haiku');
    expect(body.guard_input).toEqual(context.response.json);
  });
});
