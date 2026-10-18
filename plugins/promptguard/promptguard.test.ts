import { PluginContext } from '../types';
import { handler, PromptGuardCredentials } from './guard';

// Network is mocked throughout; no real PromptGuard key or endpoint is used.
const CREDS: PromptGuardCredentials = {
  apiKey: 'pg_test_canary_not_a_real_key',
  apiBase: 'https://promptguard.example.test',
};
const GUARD_URL = 'https://promptguard.example.test/api/v1/guard';

const params = (overrides: Record<string, any> = {}) => ({
  credentials: { ...CREDS },
  ...overrides,
});

const REQUEST_MODEL = 'gpt-4o';
const RESPONSE_MODEL = 'gpt-4o-2024-08-06';

const chatRequest = (content: any): PluginContext => ({
  requestType: 'chatComplete',
  provider: 'openai',
  request: {
    json: { model: REQUEST_MODEL, messages: [{ role: 'user', content }] },
  },
  response: { json: null },
});

const chatResponse = (contents: string[]): PluginContext => ({
  requestType: 'chatComplete',
  provider: 'openai',
  request: {
    json: { model: REQUEST_MODEL, messages: [{ role: 'user', content: 'hi' }] },
  },
  response: {
    json: {
      model: RESPONSE_MODEL,
      choices: contents.map((content) => ({
        message: { role: 'assistant', content },
      })),
    },
  },
});

const completeResponse = (texts: string[]): PluginContext => ({
  requestType: 'complete',
  provider: 'openai',
  request: { json: { model: 'gpt-3.5-turbo-instruct', prompt: 'hi' } },
  response: {
    json: {
      model: 'gpt-3.5-turbo-instruct',
      choices: texts.map((text) => ({ text })),
    },
  },
});

const redactAll = (n: number) => ({
  decision: 'redact',
  event_id: 'evt_redact',
  confidence: 0.9,
  latency_ms: 1,
  redacted_messages: Array.from({ length: n }, () => ({
    role: 'user',
    content: '[REDACTED]',
  })),
});

const ALLOW = {
  decision: 'allow',
  event_id: 'evt',
  confidence: 0,
  latency_ms: 1,
};

let fetchMock: jest.Mock;

const mockFetch = (body: any, status = 200) => {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
};

const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as any;
});

describe('promptguard guard: decisions', () => {
  it('allow -> verdict true, no transform, correct request sent', async () => {
    mockFetch(ALLOW);

    const result = await handler(
      chatRequest('hello world'),
      params(),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GUARD_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-Key']).toBe(CREDS.apiKey);
    expect(init.headers.Authorization).toBeUndefined();
    expect(sentBody()).toEqual({
      messages: [{ role: 'user', content: 'hello world' }],
      direction: 'input',
      model: REQUEST_MODEL,
    });
  });

  it('block -> verdict false with the guard response as data', async () => {
    mockFetch({
      decision: 'block',
      event_id: 'evt_block',
      confidence: 0.98,
      threat_type: 'prompt_injection',
      threats: [{ type: 'prompt_injection', confidence: 0.98, details: 'x' }],
      latency_ms: 5,
    });

    const result = await handler(
      chatRequest('ignore all previous instructions'),
      params(),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data.threat_type).toBe('prompt_injection');
  });

  it('redact on a request rewrites a copy and leaves the context intact', async () => {
    mockFetch(redactAll(1));
    const ctx = chatRequest('my key is FAKE-SECRET-CANARY');

    const result = await handler(ctx, params(), 'beforeRequestHook');

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(result.transformedData.request.json.messages[0].content).toBe(
      '[REDACTED]'
    );
    expect(ctx.request.json.messages[0].content).toBe(
      'my key is FAKE-SECRET-CANARY'
    );
  });

  it('redact on a response rewrites the response json', async () => {
    mockFetch(redactAll(1));

    const result = await handler(
      chatResponse(['call me at 555-0100']),
      params(),
      'afterRequestHook'
    );

    expect(result.transformed).toBe(true);
    expect(sentBody().direction).toBe('output');
    expect(sentBody().messages[0].role).toBe('assistant');
    expect(
      result.transformedData.response.json.choices[0].message.content
    ).toBe('[REDACTED]');
  });
});

describe('promptguard guard: errors and configuration', () => {
  it('fails closed on an API error by default', async () => {
    mockFetch({ error: 'boom' }, 500);

    const result = await handler(
      chatRequest('hello'),
      params(),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(String(result.error)).toContain('500');
  });

  it('fails open on an API error when blockOnError is false', async () => {
    mockFetch({ error: 'boom' }, 500);

    const result = await handler(
      chatRequest('hello'),
      params({ blockOnError: false }),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeTruthy();
  });

  it('reads blockOnError from credentials when no parameter is set', async () => {
    mockFetch({ error: 'boom' }, 503);

    const result = await handler(
      chatRequest('hello'),
      { credentials: { ...CREDS, blockOnError: false } },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
  });

  it('fails closed when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await handler(
      chatRequest('hello'),
      params(),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('missing apiKey -> verdict true with an error, no network call', async () => {
    const result = await handler(
      chatRequest('hello'),
      { credentials: { apiBase: CREDS.apiBase } as PromptGuardCredentials },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(String(result.error)).toContain('apiKey');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('missing apiBase -> verdict true with an error, no network call', async () => {
    const result = await handler(
      chatRequest('hello'),
      { credentials: { apiKey: CREDS.apiKey } as PromptGuardCredentials },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(String(result.error)).toContain('apiBase');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips a trailing slash from apiBase', async () => {
    mockFetch(ALLOW);

    await handler(
      chatRequest('hi'),
      params({ credentials: { ...CREDS, apiBase: `${CREDS.apiBase}/` } }),
      'beforeRequestHook'
    );

    expect(fetchMock.mock.calls[0][0]).toBe(GUARD_URL);
  });

  it('image-only content passes through without a network call', async () => {
    const result = await handler(
      chatRequest([
        { type: 'image_url', image_url: { url: 'https://x/y.png' } },
      ]),
      params(),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streaming responses with no json pass through without a call', async () => {
    const ctx = chatResponse([]);
    ctx.response.json = null;

    const result = await handler(ctx, params(), 'afterRequestHook');

    expect(result.verdict).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('promptguard guard: model', () => {
  it('sends the payload model, not the provider slug', async () => {
    mockFetch(ALLOW);

    await handler(chatRequest('hi'), params(), 'beforeRequestHook');

    expect(sentBody().model).toBe(REQUEST_MODEL);
  });

  it('falls back to the response model, then to parameters.model', async () => {
    mockFetch(ALLOW);
    const ctx = chatResponse(['all good']);
    delete ctx.request.json.model;

    await handler(ctx, params({ model: 'configured' }), 'afterRequestHook');
    expect(sentBody(0).model).toBe(RESPONSE_MODEL);

    delete ctx.response.json.model;
    await handler(ctx, params({ model: 'configured' }), 'afterRequestHook');
    expect(sentBody(1).model).toBe('configured');
  });
});

describe('promptguard guard: redaction is applied, not merely claimed', () => {
  it('errors when redact arrives without replacements (fail closed)', async () => {
    mockFetch({ ...redactAll(0), redacted_messages: null });

    const result = await handler(
      chatRequest('ssn 123-45-6789'),
      params(),
      'beforeRequestHook'
    );

    expect(result.transformed).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.verdict).toBe(false);
  });

  it('honours blockOnError false on an unapplied redaction', async () => {
    mockFetch({ ...redactAll(0), redacted_messages: null });

    const result = await handler(
      chatRequest('ssn 123-45-6789'),
      params({ blockOnError: false }),
      'beforeRequestHook'
    );

    expect(result.transformed).toBe(false);
    expect(result.verdict).toBe(true);
  });

  it('refuses a partial redaction', async () => {
    mockFetch(redactAll(1));
    const ctx: PluginContext = {
      requestType: 'complete',
      request: {
        json: {
          model: 'gpt-3.5-turbo-instruct',
          prompt: ['ssn 123-45-6789', 'card 4111 1111 1111 1111'],
        },
      },
      response: { json: null },
    };

    const result = await handler(ctx, params(), 'beforeRequestHook');

    expect(result.transformed).toBe(false);
    expect(result.error).toMatch(/1 usable replacement/);
    expect(result.verdict).toBe(false);
  });

  it('keeps image parts in place when redacting a multimodal message', async () => {
    mockFetch(redactAll(1));
    const image = { type: 'image_url', image_url: { url: 'https://x/y.png' } };

    const result = await handler(
      chatRequest([image, { type: 'text', text: 'ssn 123-45-6789' }]),
      params(),
      'beforeRequestHook'
    );

    expect(sentBody().messages).toHaveLength(1);
    const content = result.transformedData.request.json.messages[0].content;
    expect(content[0]).toEqual(image);
    expect(content[1].text).toBe('[REDACTED]');
  });

  const requestCases: Array<[string, PluginContext, (json: any) => unknown]> = [
    ['chatComplete', chatRequest('secret'), (json) => json.messages[0].content],
    [
      'messages',
      {
        requestType: 'messages',
        request: {
          json: {
            model: 'claude-3',
            messages: [{ role: 'user', content: 'secret' }],
          },
        },
        response: { json: null },
      },
      (json) => json.messages[0].content,
    ],
    [
      'complete',
      {
        requestType: 'complete',
        request: { json: { model: 'm', prompt: 'secret' } },
        response: { json: null },
      },
      (json) => json.prompt,
    ],
    [
      'embed',
      {
        requestType: 'embed',
        request: { json: { model: 'm', input: 'secret' } },
        response: { json: null },
      },
      (json) => json.input,
    ],
  ];

  it.each(requestCases)(
    'applies a redaction to a %s request',
    async (_type, ctx, read) => {
      mockFetch(redactAll(1));

      const result = await handler(ctx, params(), 'beforeRequestHook');

      expect(result.transformed).toBe(true);
      expect(result.error).toBeFalsy();
      expect(read(result.transformedData.request.json)).toBe('[REDACTED]');
    }
  );

  it('scans and redacts every chat choice when n > 1 without mutation', async () => {
    mockFetch(redactAll(2));
    const ctx = chatResponse(['ssn 123-45-6789', 'card 4111 1111 1111 1111']);

    const result = await handler(ctx, params(), 'afterRequestHook');

    expect(sentBody().messages).toHaveLength(2);
    const choices = result.transformedData.response.json.choices;
    expect(choices.map((c: any) => c.message.content)).toEqual([
      '[REDACTED]',
      '[REDACTED]',
    ]);
    expect(ctx.response.json.choices[0].message.content).toBe(
      'ssn 123-45-6789'
    );
  });

  it('scans and redacts every completion when n > 1 without mutation', async () => {
    mockFetch(redactAll(2));
    const ctx = completeResponse([
      'ssn 123-45-6789',
      'card 4111 1111 1111 1111',
    ]);

    const result = await handler(ctx, params(), 'afterRequestHook');

    expect(sentBody().messages).toHaveLength(2);
    const choices = result.transformedData.response.json.choices;
    expect(choices.map((c: any) => c.text)).toEqual([
      '[REDACTED]',
      '[REDACTED]',
    ]);
    expect(ctx.response.json.choices[0].text).toBe('ssn 123-45-6789');
  });

  it('writes Anthropic messages responses back into content blocks', async () => {
    mockFetch(redactAll(1));
    const ctx: PluginContext = {
      requestType: 'messages',
      request: {
        json: {
          model: 'claude-3',
          messages: [{ role: 'user', content: 'hi' }],
        },
      },
      response: {
        json: {
          model: 'claude-3',
          content: [{ type: 'text', text: 'ssn 123-45-6789' }],
        },
      },
    };

    const result = await handler(ctx, params(), 'afterRequestHook');

    expect(result.transformedData.response.json.content).toEqual([
      { type: 'text', text: '[REDACTED]' },
    ]);
  });
});
