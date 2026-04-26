import { handler as redactHandler } from './redact';
import { handler as rehydrateHandler } from './rehydrate';
import { post } from '../utils';
import { PluginContext } from '../types';

jest.mock('../utils', () => {
  const actual = jest.requireActual('../utils');
  return {
    ...actual,
    post: jest.fn(),
  };
});

const mockedPost = post as jest.Mock;

const baseCredentials = {
  apiKey: 'test-peyeeye-key',
};

const buildContextStringContent = (text: string): PluginContext =>
  ({
    request: {
      json: {
        messages: [{ role: 'user', content: text }],
      },
    },
    requestType: 'chatComplete',
    metadata: { requestID: 'req-123' },
  }) as unknown as PluginContext;

const buildContextMultimodal = (parts: any[]): PluginContext =>
  ({
    request: {
      json: {
        messages: [{ role: 'user', content: parts }],
      },
    },
    requestType: 'chatComplete',
    metadata: { requestID: 'req-mm-1' },
  }) as unknown as PluginContext;

const buildResponseContext = (
  text: string,
  requestID = 'req-123'
): PluginContext =>
  ({
    response: {
      json: {
        choices: [{ message: { role: 'assistant', content: text } }],
      },
    },
    requestType: 'chatComplete',
    metadata: { requestID },
  }) as unknown as PluginContext;

const makeCacheOptions = () => {
  const store = new Map<string, any>();
  return {
    env: {},
    store,
    getFromCacheByKey: jest.fn(async (_env: any, key: string) =>
      store.get(key)
    ),
    putInCacheWithValue: jest.fn(async (_env: any, key: string, value: any) => {
      store.set(key, value);
      return value;
    }),
  };
};

beforeEach(() => {
  mockedPost.mockReset();
});

describe('peyeeye redact handler', () => {
  it('returns an error if the api key is missing', async () => {
    const context = buildContextStringContent('Hi I am Alice');
    const result = await redactHandler(
      context,
      { credentials: undefined } as any,
      'beforeRequestHook',
      makeCacheOptions() as any
    );
    expect(result.error).toBeDefined();
    expect(result.error.message).toMatch(/api key/i);
    expect(result.transformed).toBe(false);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('redacts a plain-string user message and caches the session id', async () => {
    mockedPost.mockResolvedValueOnce({
      text: ['Hi I am [PERSON_1]'],
      session_id: 'ses_abc123',
    });
    const context = buildContextStringContent('Hi I am Alice');
    const cacheOptions = makeCacheOptions();

    const result = await redactHandler(
      context,
      { credentials: baseCredentials, locale: 'auto', sessionMode: 'stateful' },
      'beforeRequestHook',
      cacheOptions as any
    );

    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);
    expect(result.transformedData?.request?.json?.messages?.[0]?.content).toBe(
      'Hi I am [PERSON_1]'
    );

    // post was called against /v1/redact with the right body shape.
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockedPost.mock.calls[0];
    expect(url).toMatch(/\/v1\/redact$/);
    expect(body).toEqual({ text: ['Hi I am Alice'], locale: 'auto' });

    // Cache write recorded.
    expect(cacheOptions.putInCacheWithValue).toHaveBeenCalledTimes(1);
    expect(cacheOptions.store.get('peyeeye:session:req-123')).toEqual({
      sessionId: 'ses_abc123',
      sessionMode: 'stateful',
    });
  });

  it('redacts multimodal text parts and writes them back at the right indices', async () => {
    mockedPost.mockResolvedValueOnce({
      text: ['hello [PERSON_1]', 'reach me at [EMAIL_1]'],
      session_id: 'ses_mm',
    });
    const context = buildContextMultimodal([
      { type: 'text', text: 'hello Alice' },
      { type: 'image_url', image_url: { url: 'https://x/y.png' } },
      { type: 'text', text: 'reach me at alice@example.com' },
    ]);
    const cacheOptions = makeCacheOptions();

    const result = await redactHandler(
      context,
      { credentials: baseCredentials },
      'beforeRequestHook',
      cacheOptions as any
    );

    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);
    const newParts =
      result.transformedData?.request?.json?.messages?.[0]?.content;
    expect(newParts).toEqual([
      { type: 'text', text: 'hello [PERSON_1]' },
      { type: 'image_url', image_url: { url: 'https://x/y.png' } },
      { type: 'text', text: 'reach me at [EMAIL_1]' },
    ]);

    // The image part contributed an empty string to inputTexts; we must NOT
    // have sent it to /v1/redact.
    const [, body] = mockedPost.mock.calls[0];
    expect(body.text).toEqual(['hello Alice', 'reach me at alice@example.com']);
  });

  it('raises (no silent passthrough) when redacted count != input count', async () => {
    mockedPost.mockResolvedValueOnce({
      text: ['only one back'],
      session_id: 'ses_x',
    });
    const context = buildContextMultimodal([
      { type: 'text', text: 'first PII' },
      { type: 'text', text: 'second PII' },
    ]);

    const result = await redactHandler(
      context,
      { credentials: baseCredentials },
      'beforeRequestHook',
      makeCacheOptions() as any
    );

    expect(result.error).toBeDefined();
    expect(result.error.message).toMatch(
      /returned 1 texts for 2 inputs|partially-redacted/
    );
    expect(result.transformed).toBe(false);
  });

  it('raises when /v1/redact returns an unexpected response shape', async () => {
    mockedPost.mockResolvedValueOnce({ unexpected: 'no text field' });
    const context = buildContextStringContent('hello Alice');

    const result = await redactHandler(
      context,
      { credentials: baseCredentials },
      'beforeRequestHook',
      makeCacheOptions() as any
    );

    expect(result.error).toBeDefined();
    expect(result.error.message).toMatch(/unexpected response shape/i);
    expect(result.transformed).toBe(false);
  });

  it('caches the rehydration_key in stateless mode', async () => {
    mockedPost.mockResolvedValueOnce({
      text: ['Hi I am [PERSON_1]'],
      rehydration_key: 'skey_abc',
    });
    const context = buildContextStringContent('Hi I am Alice');
    const cacheOptions = makeCacheOptions();

    const result = await redactHandler(
      context,
      { credentials: baseCredentials, sessionMode: 'stateless' },
      'beforeRequestHook',
      cacheOptions as any
    );

    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);
    expect(cacheOptions.store.get('peyeeye:session:req-123')).toEqual({
      sessionId: 'skey_abc',
      sessionMode: 'stateless',
    });
    const [, body] = mockedPost.mock.calls[0];
    expect(body.session).toBe('stateless');
  });
});

describe('peyeeye rehydrate handler', () => {
  it('rehydrates when a cached session exists and DELETEs the session', async () => {
    mockedPost.mockResolvedValueOnce({
      text: 'Hello Alice, your card is 4242…',
      replaced: 2,
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204 } as any);
    const originalFetch = (global as any).fetch;
    (global as any).fetch = fetchMock;

    try {
      const cacheOptions = makeCacheOptions();
      cacheOptions.store.set('peyeeye:session:req-123', {
        sessionId: 'ses_abc123',
        sessionMode: 'stateful',
      });

      const responseCtx = buildResponseContext(
        'Hello [PERSON_1], your card is [CARD_1]'
      );

      const result = await rehydrateHandler(
        responseCtx,
        { credentials: baseCredentials, sessionMode: 'stateful' },
        'afterRequestHook',
        cacheOptions as any
      );

      expect(result.error).toBeNull();
      expect(result.transformed).toBe(true);
      expect(
        result.transformedData?.response?.json?.choices?.[0]?.message?.content
      ).toBe('Hello Alice, your card is 4242…');

      // Rehydrate POSTed once with the cached session id.
      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url, body] = mockedPost.mock.calls[0];
      expect(url).toMatch(/\/v1\/rehydrate$/);
      expect(body).toEqual({
        text: 'Hello [PERSON_1], your card is [CARD_1]',
        session: 'ses_abc123',
      });

      // DELETE was called once for stateful cleanup.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [deleteUrl, deleteOpts] = fetchMock.mock.calls[0];
      expect(deleteUrl).toMatch(/\/v1\/sessions\/ses_abc123$/);
      expect(deleteOpts.method).toBe('DELETE');
    } finally {
      (global as any).fetch = originalFetch;
    }
  });

  it('no-ops cleanly when no cached session exists', async () => {
    const cacheOptions = makeCacheOptions(); // empty store

    const responseCtx = buildResponseContext(
      'plain assistant text',
      'no-such-req'
    );

    const result = await rehydrateHandler(
      responseCtx,
      { credentials: baseCredentials, sessionMode: 'stateful' },
      'afterRequestHook',
      cacheOptions as any
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('swallows DELETE failures without surfacing an error', async () => {
    mockedPost.mockResolvedValueOnce({
      text: 'Hello Alice',
      replaced: 1,
    });
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    const originalFetch = (global as any).fetch;
    (global as any).fetch = fetchMock;

    try {
      const cacheOptions = makeCacheOptions();
      cacheOptions.store.set('peyeeye:session:req-123', {
        sessionId: 'ses_xyz',
        sessionMode: 'stateful',
      });

      const result = await rehydrateHandler(
        buildResponseContext('Hello [PERSON_1]'),
        { credentials: baseCredentials, sessionMode: 'stateful' },
        'afterRequestHook',
        cacheOptions as any
      );

      expect(result.error).toBeNull();
      expect(result.transformed).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });

  it('does not call DELETE for stateless (skey_) sessions', async () => {
    mockedPost.mockResolvedValueOnce({
      text: 'Hello Alice',
      replaced: 1,
    });
    const fetchMock = jest.fn();
    const originalFetch = (global as any).fetch;
    (global as any).fetch = fetchMock;

    try {
      const cacheOptions = makeCacheOptions();
      cacheOptions.store.set('peyeeye:session:req-123', {
        sessionId: 'skey_sealed_blob',
        sessionMode: 'stateless',
      });

      const result = await rehydrateHandler(
        buildResponseContext('Hello [PERSON_1]'),
        { credentials: baseCredentials, sessionMode: 'stateless' },
        'afterRequestHook',
        cacheOptions as any
      );

      expect(result.error).toBeNull();
      expect(result.transformed).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      (global as any).fetch = originalFetch;
    }
  });

  it('returns an error if the api key is missing', async () => {
    const result = await rehydrateHandler(
      buildResponseContext('Hello [PERSON_1]'),
      { credentials: undefined } as any,
      'afterRequestHook',
      makeCacheOptions() as any
    );
    expect(result.error).toBeDefined();
    expect(result.error.message).toMatch(/api key/i);
  });
});
