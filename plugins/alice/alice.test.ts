import { handler } from './evaluate';

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  post: jest.fn(),
}));

import * as utils from '../utils';
import { HttpError, TimeoutError } from '../utils';

const mockPost = utils.post as jest.MockedFunction<typeof utils.post>;

const credentials = { apiKey: 'af-test-key' };
const params = { credentials, appId: 'payments-bot' };

/** A chat-completion hook context, in the shape the gateway builds one. */
function chatContext(overrides: Record<string, any> = {}) {
  return {
    requestType: 'chatComplete',
    provider: 'openai',
    metadata: { _user: 'alice' },
    request: {
      json: {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'be helpful' },
          { role: 'user', content: 'my card is 4111111111111111' },
        ],
      },
      text: 'my card is 4111111111111111',
      isStreamingRequest: false,
      isTransformed: false,
      headers: {
        authorization: 'Bearer sk-caller-secret',
        'x-portkey-api-key': 'pk-secret',
        'x-portkey-trace-id': 'trace-1',
      },
    },
    response: {
      json: {
        choices: [{ message: { role: 'assistant', content: 'sure thing' } }],
      },
      text: 'sure thing',
      statusCode: 200,
      isTransformed: false,
    },
    ...overrides,
  } as any;
}

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ verdict: 'ALLOW', categories: [] });
});

describe('configuration', () => {
  it('reports a missing API key rather than screening nothing silently', async () => {
    const actual = await handler(
      chatContext(),
      { appId: 'a' },
      'beforeRequestHook'
    );

    expect(actual.error).toBeDefined();
    expect(actual.verdict).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  // Alice measures a request against one application's policies, so a request naming none is
  // refused rather than evaluated against a guess.
  it('reports a missing application', async () => {
    const actual = await handler(
      chatContext(),
      { credentials },
      'beforeRequestHook'
    );

    expect(actual.error).toBeDefined();
    expect(actual.verdict).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects an unsupported hook type', async () => {
    const actual = await handler(chatContext(), params, 'startHook' as any);

    expect(actual.error).toBeDefined();
    expect(actual.verdict).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('what it sends', () => {
  it('posts the request text, the application and the trace to the evaluate route', async () => {
    await handler(chatContext(), params, 'beforeRequestHook');

    const [url, body, options, timeout] = mockPost.mock.calls[0];
    expect(url).toBe('https://api.alice.io/v2/evaluate/portkey');
    expect(body).toMatchObject({
      input_type: 'request',
      event_type: 'beforeRequestHook',
      app_id: 'payments-bot',
      trace_id: 'trace-1',
      inputs: { texts: ['my card is 4111111111111111'] },
    });
    expect((options as any).headers['af-api-key']).toBe('af-test-key');
    expect(timeout).toBe(5000);
  });

  it('posts the completion on the after-request hook', async () => {
    await handler(chatContext(), params, 'afterRequestHook');

    expect(mockPost.mock.calls[0][1]).toMatchObject({
      input_type: 'response',
      event_type: 'afterRequestHook',
      inputs: { texts: ['sure thing'] },
    });
  });

  it('forwards the hook context so selection stays on Alice’s side', async () => {
    await handler(chatContext(), params, 'beforeRequestHook');

    const body = mockPost.mock.calls[0][1] as any;
    expect(body.context.request.json.messages).toHaveLength(2);
    expect(body.context.metadata).toEqual({ _user: 'alice' });
    expect(body.context.provider).toBe('openai');
  });

  // context.request.headers carries the caller's Authorization and the Portkey key in the clear.
  it('never lets a credential leave the gateway, at any depth', async () => {
    const context = chatContext({
      metadata: { nested: { credentials: { apiKey: 'nested-secret' } } },
    });
    context.request.json.provider_options = { api_key: 'provider-secret' };

    await handler(context, params, 'beforeRequestHook');

    const serialized = JSON.stringify(mockPost.mock.calls[0][1]);
    expect(serialized).not.toContain('sk-caller-secret');
    expect(serialized).not.toContain('pk-secret');
    expect(serialized).not.toContain('nested-secret');
    expect(serialized).not.toContain('provider-secret');
  });

  it('leaves the real context untouched while stripping the outbound copy', async () => {
    const context = chatContext();

    await handler(context, params, 'beforeRequestHook');

    expect(context.request.headers.authorization).toBe(
      'Bearer sk-caller-secret'
    );
  });

  it('serializes a context that holds a cycle rather than throwing', async () => {
    const context = chatContext();
    context.request.json.self = context.request.json;

    const actual = await handler(context, params, 'beforeRequestHook');

    expect(actual.error).toBeNull();
    expect(mockPost).toHaveBeenCalled();
  });

  it('honours a configured api base and timeout', async () => {
    await handler(
      chatContext(),
      {
        credentials: { ...credentials, apiBase: 'https://alice.internal/' },
        appId: 'a',
        timeout: 900,
      },
      'beforeRequestHook'
    );

    expect(mockPost.mock.calls[0][0]).toBe(
      'https://alice.internal/v2/evaluate/portkey'
    );
    expect(mockPost.mock.calls[0][3]).toBe(900);
  });

  it('reads the trace id whatever casing the client sent it in', async () => {
    const context = chatContext();
    delete context.request.headers['x-portkey-trace-id'];
    context.request.headers['X-Portkey-Trace-Id'] = 'trace-upper';

    await handler(context, params, 'beforeRequestHook');

    expect((mockPost.mock.calls[0][1] as any).trace_id).toBe('trace-upper');
  });

  // A streamed response reaches the after-request hook with no JSON at all; a round trip there
  // could only ever answer ALLOW.
  it('skips the call entirely when there is nothing to screen', async () => {
    const context = chatContext({
      response: { json: null, text: '', statusCode: 200 },
    });

    const actual = await handler(context, params, 'afterRequestHook');

    expect(actual).toEqual({ error: null, verdict: true, data: null });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('reports a content shape it cannot read rather than passing it', async () => {
    const context = chatContext({
      requestType: 'chatComplete',
      request: { json: {} },
    });

    const actual = await handler(context, params, 'beforeRequestHook');

    expect(actual.error).toBeDefined();
    expect(actual.verdict).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('the verdict it enforces', () => {
  it('allows', async () => {
    mockPost.mockResolvedValue({ verdict: 'ALLOW', categories: [] });

    const actual = await handler(chatContext(), params, 'beforeRequestHook');

    expect(actual).toMatchObject({ error: null, verdict: true });
    expect(actual.transformed).toBeFalsy();
  });

  it('blocks, carrying the policy’s own message', async () => {
    mockPost.mockResolvedValue({
      verdict: 'BLOCK',
      categories: ['pii'],
      correlation_id: 'corr-1',
      message: 'Card numbers are not allowed here.',
    });

    const actual = await handler(chatContext(), params, 'beforeRequestHook');

    expect(actual.verdict).toBe(false);
    expect(actual.error).toBeNull();
    expect(actual.data.explanation).toContain(
      'Card numbers are not allowed here.'
    );
    expect(actual.data.explanation).toContain('pii');
    expect(actual.data.explanation).toContain('corr-1');
  });

  it('blocks with a generic message when the policy named none', async () => {
    mockPost.mockResolvedValue({ verdict: 'BLOCK', categories: [] });

    const actual = await handler(chatContext(), params, 'beforeRequestHook');

    expect(actual.verdict).toBe(false);
    expect(actual.data.explanation).toContain('content policy');
  });

  // Recorded on Alice's side and allowed through — the correlation id is what ties the request to
  // that record.
  it('lets a detection through, carrying the correlation id', async () => {
    mockPost.mockResolvedValue({
      verdict: 'DETECT',
      categories: ['profanity'],
      correlation_id: 'corr-2',
    });

    const actual = await handler(chatContext(), params, 'beforeRequestHook');

    expect(actual.verdict).toBe(true);
    expect(actual.data.explanation).toContain('corr-2');
  });

  it('masks the request text positionally', async () => {
    mockPost.mockResolvedValue({
      verdict: 'MASK',
      categories: ['pii'],
      replacements: [{ index: 0, text: 'my card is ****' }],
    });

    const actual = await handler(chatContext(), params, 'beforeRequestHook');

    expect(actual.verdict).toBe(true);
    expect(actual.transformed).toBe(true);
    const lastMessage = actual.transformedData.request.json.messages[1];
    expect(lastMessage.content).toBe('my card is ****');
    // The turns before the one being screened are carried through untouched.
    expect(actual.transformedData.request.json.messages[0].content).toBe(
      'be helpful'
    );
  });

  it('masks the response text positionally', async () => {
    mockPost.mockResolvedValue({
      verdict: 'MASK',
      categories: ['pii'],
      replacements: [{ index: 0, text: 'sure ****' }],
    });

    const actual = await handler(chatContext(), params, 'afterRequestHook');

    expect(actual.transformed).toBe(true);
    expect(
      actual.transformedData.response.json.choices[0].message.content
    ).toBe('sure ****');
  });

  it('masks every block of a multi-part message', async () => {
    const context = chatContext();
    context.request.json.messages[1].content = [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ];
    mockPost.mockResolvedValue({
      verdict: 'MASK',
      categories: [],
      replacements: [{ index: 1, text: '**' }],
    });

    const actual = await handler(context, params, 'beforeRequestHook');

    expect(actual.transformedData.request.json.messages[1].content).toEqual([
      { type: 'text', text: 'first' },
      { type: 'text', text: '**' },
    ]);
  });

  describe('a mask that cannot be applied in full', () => {
    // All-or-nothing: a partially applied list would let content Alice meant to replace reach the
    // model alongside content that was replaced.
    it.each([
      ['an out-of-range index', [{ index: 9, text: 'x' }]],
      ['a negative index', [{ index: -1, text: 'x' }]],
      ['a non-integer index', [{ index: 0.5, text: 'x' }]],
      ['a missing index', [{ text: 'x' }]],
      ['a missing text', [{ index: 0 }]],
      ['an empty list', []],
      ['no list at all', undefined],
    ])('blocks outright on %s', async (_label, replacements) => {
      mockPost.mockResolvedValue({
        verdict: 'MASK',
        categories: [],
        replacements,
      } as any);

      const actual = await handler(chatContext(), params, 'beforeRequestHook');

      expect(actual.verdict).toBe(false);
      expect(actual.transformed).toBeFalsy();
    });
  });

  // Reported as an error rather than as a pass, so `failOnError` alone decides open versus closed.
  it.each([
    ['an unknown verdict', { verdict: 'SHRUG', categories: [] }],
    ['a verdict-less body', { categories: [] }],
    ['an empty body', {}],
  ])('reports %s rather than treating it as a pass', async (_label, body) => {
    mockPost.mockResolvedValue(body as any);

    const actual = await handler(chatContext(), params, 'beforeRequestHook');

    expect(actual.error).toBeDefined();
    expect(actual.verdict).toBe(true);
    expect(actual.transformed).toBeFalsy();
  });
});

describe('when Alice cannot be reached', () => {
  it.each([
    [
      'a 5xx',
      new HttpError('HTTP error! status: 503', {
        status: 503,
        statusText: 'Service Unavailable',
        body: 'down',
      }),
    ],
    [
      'a 4xx',
      new HttpError('HTTP error! status: 401', {
        status: 401,
        statusText: 'Unauthorized',
        body: 'bad key',
      }),
    ],
    [
      'a timeout',
      new TimeoutError('Request timed out after 5000ms', 'u', 5000, 'POST'),
    ],
    ['a network failure', new Error('fetch failed')],
  ])('reports %s as a check error, never as a pass', async (_label, thrown) => {
    mockPost.mockRejectedValue(thrown);

    const actual = await handler(chatContext(), params, 'beforeRequestHook');

    expect(actual.error).toBeDefined();
    expect(actual.verdict).toBe(true);
    expect(actual.transformed).toBeFalsy();
  });
});

describe('the explanation it writes into the log', () => {
  // The policy's own message usually ends in a full stop, and the segments are joined with one.
  it('does not double the full stop after the policy message', async () => {
    mockPost.mockResolvedValue({
      verdict: 'BLOCK',
      categories: ['pii'],
      correlation_id: 'corr-1',
      message: 'Blocked by the content policy.',
    });

    const actual = await handler(chatContext(), params, 'beforeRequestHook');

    expect(actual.data.explanation).toBe(
      'Blocked by the content policy. categories: pii. correlation id: corr-1'
    );
  });
});
