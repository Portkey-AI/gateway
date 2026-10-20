import app from '../index';

jest.mock('../../conf.json', () => ({ cache: false }), { virtual: true });

jest.mock('../utils/env', () => ({ Environment: () => ({}) }));
jest.mock('../../plugins', () => ({ plugins: {} }));

describe('Hopper gateway requests', () => {
  let upstream: jest.SpyInstance;

  beforeEach(() => {
    upstream = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected upstream request'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const request = (body: Record<string, unknown>) =>
    app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-portkey-provider': 'hopper',
        authorization: 'Bearer hopper-test-key',
      },
      body: JSON.stringify(body),
    });

  const assertUpstream = (body: Record<string, unknown>) => {
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe('https://api.withhopper.com/v1/chat/completions');
    expect(new Headers(options.headers).get('authorization')).toBe(
      'Bearer hopper-test-key'
    );
    expect(JSON.parse(options.body)).toEqual(body);
  };

  it.each(['gemma-4-31b', 'deepseek-v4.1-flash'])(
    'routes %s without changing the model ID',
    async (model) => {
      const completion = {
        id: 'chatcmpl-hopper-test',
        object: 'chat.completion',
        created: 1,
        model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 1,
          total_tokens: 6,
          prompt_tokens_details: { cached_tokens: 3 },
        },
      };
      upstream.mockResolvedValueOnce(Response.json(completion));
      const body = {
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 16,
      };
      const response = await request(body);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject(completion);
      assertUpstream(body);
    }
  );

  it.each(['gemma-4-31b', 'deepseek-v4.1-flash'])(
    'streams %s including the finish event',
    async (model) => {
      const chunk = {
        id: 'chatcmpl-hopper-test',
        object: 'chat.completion.chunk',
        created: 1,
        model,
        choices: [
          { index: 0, delta: { content: 'Hello' }, finish_reason: null },
        ],
      };
      const finish = {
        ...chunk,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };
      const sse = `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`;
      upstream.mockResolvedValueOnce(
        new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
      );
      const body = {
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
        stream_options: { include_usage: true },
      };
      const response = await request(body);
      expect(response.status).toBe(200);
      const stream = await response.text();
      expect(stream).toContain('"content":"Hello"');
      expect(stream).toContain('"finish_reason":"stop"');
      expect(stream).toContain('data: [DONE]');
      assertUpstream(body);
    }
  );

  it('forwards Gemma tool definitions and tool calls', async () => {
    const toolCall = {
      id: 'call-test',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"SF"}' },
    };
    const completion = {
      id: 'chatcmpl-tools',
      object: 'chat.completion',
      created: 1,
      model: 'gemma-4-31b',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: null, tool_calls: [toolCall] },
          finish_reason: 'tool_calls',
        },
      ],
    };
    upstream.mockResolvedValueOnce(Response.json(completion));
    const body = {
      model: 'gemma-4-31b',
      messages: [{ role: 'user', content: 'Weather in SF?' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        },
      ],
      tool_choice: 'auto',
    };
    const response = await request(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(completion);
    assertUpstream(body);
  });

  it('preserves upstream authentication errors', async () => {
    upstream.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            message: 'Invalid API key',
            type: 'authentication_error',
            code: 'invalid_api_key',
          },
        },
        { status: 401 }
      )
    );
    const response = await request({
      model: 'gemma-4-31b',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: {
        message: 'hopper error: Invalid API key',
        type: 'authentication_error',
      },
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
