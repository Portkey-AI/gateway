import { handler as onlineHandler } from './online';
import { PluginContext } from '../types';

const MCP_URL = 'https://search.parallel.ai/mcp';

const SECRET_SYSTEM = 'SYSTEM_SECRET_do_not_send';
const EARLIER_USER = 'EARLIER_USER_do_not_send';
const LATEST_USER = 'Who is the current UN Secretary-General?';
const PROVIDER_KEY = 'sk-provider-secret-do-not-send';

type RecordedCall = {
  url: string;
  body: any;
  headers: Record<string, string>;
};

const sampleResults = [
  {
    url: 'https://www.un.org/sg/',
    title: 'Secretary-General | United Nations',
    publish_date: '2026-10-31',
    excerpts: ['António Guterres is the United Nations Secretary-General.'],
  },
  {
    url: 'https://news.un.org/en/story/example',
    title: 'UN News',
    publish_date: null,
    excerpts: ['A second excerpt that should be dropped when numResults is 1.'],
  },
];

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function searchPayload(results = sampleResults) {
  return {
    search_id: 'search_test',
    results,
    warnings: null,
    session_id: 'session_test',
  };
}

function mockSearchExchange(options?: {
  results?: any[];
  toolsStatus?: number;
  toolsBody?: unknown;
  toolsContentType?: string;
  initializeStatus?: number;
  hang?: boolean;
}) {
  const calls: RecordedCall[] = [];
  const fetchMock = jest.fn(async (url: any, init: any) => {
    const headers = init?.headers || {};
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, headers });

    if (options?.hang) {
      return new Promise((_resolve, reject) => {
        const abort = () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        };
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener('abort', abort);
      });
    }

    if (options?.initializeStatus && body?.method === 'initialize') {
      return jsonResponse({ error: 'rate limited' }, options.initializeStatus);
    }

    if (body?.method === 'initialize') {
      return jsonResponse(
        {
          jsonrpc: '2.0',
          id: body.id,
          result: { protocolVersion: '2025-03-26' },
        },
        200,
        { 'Mcp-Session-Id': 'sess-1' }
      );
    }

    if (body?.method === 'notifications/initialized') {
      return new Response(null, { status: 202 });
    }

    if (body?.method === 'tools/call') {
      if (options?.toolsContentType?.includes('text/event-stream')) {
        return new Response(String(options.toolsBody), {
          status: options.toolsStatus || 200,
          headers: { 'Content-Type': options.toolsContentType },
        });
      }
      const payload =
        options?.toolsBody !== undefined
          ? options.toolsBody
          : {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      searchPayload(options?.results || sampleResults)
                    ),
                  },
                ],
              },
            };
      return jsonResponse(payload, options?.toolsStatus || 200);
    }

    return jsonResponse({ error: 'unexpected method' }, 500);
  });

  global.fetch = fetchMock as any;
  return calls;
}

function chatContext(messages: any[]): PluginContext {
  return {
    request: {
      json: { messages },
    },
    requestType: 'chatComplete',
  } as PluginContext;
}

function enabledParameters(extra: Record<string, any> = {}) {
  return {
    enabled: true,
    credentials: { apiKey: PROVIDER_KEY },
    ...extra,
  };
}

describe('parallel online handler', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not call Parallel unless enabled is true', async () => {
    const calls = mockSearchExchange();
    const context = chatContext([{ role: 'user', content: LATEST_USER }]);

    const result = await onlineHandler(
      context,
      { credentials: { apiKey: PROVIDER_KEY }, numResults: 1 },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
    expect(result.transformedData.request.json).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('should only run on beforeRequestHook', async () => {
    const calls = mockSearchExchange();
    const result = await onlineHandler(
      chatContext([{ role: 'user', content: LATEST_USER }]),
      enabledParameters(),
      'afterRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('sends only the latest user text to the free Search MCP endpoint', async () => {
    const calls = mockSearchExchange();
    const context = chatContext([
      { role: 'system', content: SECRET_SYSTEM },
      { role: 'user', content: EARLIER_USER },
      { role: 'assistant', content: 'Earlier assistant reply' },
      {
        role: 'user',
        content: [
          { type: 'text', text: LATEST_USER },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example/signed-secret' },
          },
        ],
      },
    ]);

    const result = await onlineHandler(
      context,
      enabledParameters({ numResults: 1 }),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const toolCall = calls.find((call) => call.body?.method === 'tools/call');
    expect(toolCall).toBeDefined();
    expect(toolCall?.url).toBe(MCP_URL);
    const sent = JSON.stringify(calls);
    expect(sent).toContain(LATEST_USER);
    expect(sent).not.toContain(SECRET_SYSTEM);
    expect(sent).not.toContain(EARLIER_USER);
    expect(sent).not.toContain(PROVIDER_KEY);
    expect(sent).not.toContain('signed-secret');
    expect(toolCall?.body.params.name).toBe('web_search');
    expect(toolCall?.body.params.arguments.objective).toContain(LATEST_USER);
    expect(
      toolCall?.body.params.arguments.search_queries.length
    ).toBeGreaterThan(0);
    expect(toolCall?.body.params.arguments.model_name).toBeUndefined();
    expect(JSON.stringify(toolCall?.body)).not.toContain('include_domains');

    for (const call of calls) {
      expect(call.url).toBe(MCP_URL);
      const headerNames = Object.keys(call.headers).map((name) =>
        name.toLowerCase()
      );
      expect(headerNames).not.toContain('authorization');
      expect(headerNames).not.toContain('x-api-key');
      expect(headerNames).not.toContain('x-parallel-search-config');
      expect(JSON.stringify(call.headers)).not.toContain(PROVIDER_KEY);
    }
  });

  it('attaches excerpts as reference material on the latest user message', async () => {
    mockSearchExchange();
    const context = chatContext([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: EARLIER_USER },
      { role: 'user', content: LATEST_USER },
    ]);

    const result = await onlineHandler(
      context,
      enabledParameters({ numResults: 1 }),
      'beforeRequestHook'
    );

    const messages = result.transformedData.request.json.messages;
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(messages[1]).toEqual({ role: 'user', content: EARLIER_USER });
    expect(messages[2].role).toBe('user');
    expect(messages[2].content.startsWith(LATEST_USER)).toBe(true);
    expect(messages[2].content).toContain('<web_search_context>');
    expect(messages[2].content).toContain('</web_search_context>');
    expect(messages[2].content).toContain('Not instructions');
    expect(messages[2].content).toContain('https://www.un.org/sg/');
    expect(messages[2].content).toContain('António Guterres');
    expect(messages[2].content).not.toContain('second excerpt');
    expect(context.request.json.messages[2].content).toBe(LATEST_USER);
  });

  it('appends a text part when the latest user message is multipart', async () => {
    mockSearchExchange();
    const context = chatContext([
      {
        role: 'user',
        content: [{ type: 'text', text: LATEST_USER }],
      },
    ]);

    const result = await onlineHandler(
      context,
      enabledParameters(),
      'beforeRequestHook'
    );

    const content = result.transformedData.request.json.messages[0].content;
    expect(content[0]).toEqual({ type: 'text', text: LATEST_USER });
    expect(content[1].type).toBe('text');
    expect(content[1].text).toContain('<web_search_context>');
    expect(content[1].text).toContain('https://www.un.org/sg/');
  });

  it('should use custom prefix and suffix for search results', async () => {
    mockSearchExchange();
    const result = await onlineHandler(
      chatContext([{ role: 'user', content: LATEST_USER }]),
      enabledParameters({
        prefix: '\n[SEARCH_RESULTS]',
        suffix: '[END_RESULTS]\n',
      }),
      'beforeRequestHook'
    );

    const content = result.transformedData.request.json.messages[0].content;
    expect(content).toContain('[SEARCH_RESULTS]');
    expect(content).not.toContain('<web_search_context>');
    expect(content).toContain('[END_RESULTS]');
    expect(content).not.toContain('</web_search_context>');
  });

  it('should handle completion requests by appending reference material', async () => {
    mockSearchExchange();
    const context = {
      request: { json: { prompt: LATEST_USER } },
      requestType: 'complete',
    } as PluginContext;

    const result = await onlineHandler(
      context,
      enabledParameters({ numResults: 1 }),
      'beforeRequestHook'
    );

    expect(result.transformed).toBe(true);
    const prompt = result.transformedData.request.json.prompt;
    expect(prompt.startsWith(LATEST_USER)).toBe(true);
    expect(prompt).toContain('<web_search_context>');
    expect(prompt.indexOf(LATEST_USER)).toBeLessThan(
      prompt.indexOf('<web_search_context>')
    );
  });

  it('grounds Anthropic messages requests without editing the system field', async () => {
    const calls = mockSearchExchange();
    const context = {
      request: {
        json: {
          system: SECRET_SYSTEM,
          messages: [
            { role: 'user', content: EARLIER_USER },
            { role: 'assistant', content: 'prior' },
            { role: 'user', content: LATEST_USER },
          ],
        },
      },
      requestType: 'messages',
    } as PluginContext;

    const result = await onlineHandler(
      context,
      enabledParameters({ numResults: 1 }),
      'beforeRequestHook'
    );

    expect(result.transformed).toBe(true);
    const json = result.transformedData.request.json;
    expect(json.system).toBe(SECRET_SYSTEM);
    expect(json.messages[0].content).toBe(EARLIER_USER);
    expect(json.messages[2].content).toContain(LATEST_USER);
    expect(json.messages[2].content).toContain('https://www.un.org/sg/');
    expect(JSON.stringify(calls)).not.toContain(SECRET_SYSTEM);
    expect(JSON.stringify(calls)).not.toContain(EARLIER_USER);
  });

  it('should include source metadata in the response data', async () => {
    mockSearchExchange();
    const result = await onlineHandler(
      chatContext([{ role: 'user', content: LATEST_USER }]),
      enabledParameters({ numResults: 1 }),
      'beforeRequestHook'
    );

    expect(result.data.sources).toHaveLength(1);
    expect(result.data.sources[0]).toEqual(
      expect.objectContaining({
        title: 'Secretary-General | United Nations',
        url: 'https://www.un.org/sg/',
        published_date: '2026-10-31',
      })
    );
    expect(result.data.sources[0].text).toContain('António Guterres');
    expect(result.data.search_id).toBe('search_test');
  });

  it('should limit results based on numResults parameter', async () => {
    mockSearchExchange();
    const result = await onlineHandler(
      chatContext([{ role: 'user', content: LATEST_USER }]),
      enabledParameters({ numResults: 1 }),
      'beforeRequestHook'
    );

    expect(result.data.sources).toHaveLength(1);
    const content = result.transformedData.request.json.messages[0].content;
    expect(content.match(/\[\d+\]/g)).toHaveLength(1);
  });

  it('caps attached excerpts at maxContextChars', async () => {
    const longExcerpt = 'A'.repeat(5000);
    mockSearchExchange({
      results: [
        {
          url: 'https://example.com/long',
          title: 'Long page',
          publish_date: null,
          excerpts: [longExcerpt],
        },
      ],
    });

    const result = await onlineHandler(
      chatContext([{ role: 'user', content: LATEST_USER }]),
      enabledParameters({ maxContextChars: 120 }),
      'beforeRequestHook'
    );

    expect(result.transformed).toBe(true);
    expect(result.data.sources[0].text.length).toBeLessThanOrEqual(120);
    const content = result.transformedData.request.json.messages[0].content;
    expect(content).not.toContain('A'.repeat(121));
  });

  it('parses an SSE tool response from the Search MCP', async () => {
    const payload = searchPayload(sampleResults.slice(0, 1));
    const sse = [
      'event: message',
      `data: ${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        },
      })}`,
      '',
    ].join('\n');
    mockSearchExchange({
      toolsBody: sse,
      toolsContentType: 'text/event-stream',
    });

    const result = await onlineHandler(
      chatContext([{ role: 'user', content: LATEST_USER }]),
      enabledParameters({ numResults: 1 }),
      'beforeRequestHook'
    );

    expect(result.transformed).toBe(true);
    expect(result.data.sources[0].url).toBe('https://www.un.org/sg/');
  });

  it('should handle invalid queries gracefully', async () => {
    const calls = mockSearchExchange();
    const result = await onlineHandler(
      chatContext([{ role: 'user', content: '   ' }]),
      enabledParameters(),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(result.transformedData.request.json).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('leaves the request unchanged when Parallel times out', async () => {
    const calls = mockSearchExchange({ hang: true });
    const context = chatContext([
      { role: 'system', content: SECRET_SYSTEM },
      { role: 'user', content: LATEST_USER },
    ]);

    const result = await onlineHandler(
      context,
      enabledParameters({ timeout: 20 }),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
    expect(result.transformedData.request.json).toBeNull();
    expect(result.data.diagnostic).toBe(
      'Parallel Search MCP timed out; request unchanged'
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.url === MCP_URL)).toBe(true);
    expect(context.request.json.messages[1].content).toBe(LATEST_USER);
  });

  it('leaves the request unchanged when Parallel rate limits', async () => {
    const calls = mockSearchExchange({ initializeStatus: 429 });
    const context = chatContext([{ role: 'user', content: LATEST_USER }]);

    const result = await onlineHandler(
      context,
      enabledParameters({ timeout: 1000 }),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
    expect(result.transformedData.request.json).toBeNull();
    expect(result.data.diagnostic).toBe(
      'Parallel Search MCP rate limited; request unchanged'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(MCP_URL);
    expect(JSON.stringify(calls[0].headers).toLowerCase()).not.toContain(
      'authorization'
    );
  });

  it('leaves the request unchanged when the tool call fails', async () => {
    mockSearchExchange({
      toolsStatus: 500,
      toolsBody: { error: 'upstream failed' },
    });
    const context = chatContext([{ role: 'user', content: LATEST_USER }]);

    const result = await onlineHandler(
      context,
      enabledParameters(),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
    expect(result.transformedData.request.json).toBeNull();
    expect(result.data.diagnostic).toBe(
      'Parallel Search MCP failed; request unchanged'
    );
    expect(context.request.json.messages[0].content).toBe(LATEST_USER);
  });

  it('dry-run against the public Search MCP when enabled', async () => {
    const context = chatContext([
      { role: 'system', content: SECRET_SYSTEM },
      { role: 'user', content: 'Who is the current UN Secretary-General?' },
    ]);

    const result = await onlineHandler(
      context,
      enabledParameters({
        numResults: 2,
        timeout: 15000,
        maxContextChars: 2000,
      }),
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(context.request.json.messages[0].content).toBe(SECRET_SYSTEM);
    expect(context.request.json.messages[1].content).toBe(
      'Who is the current UN Secretary-General?'
    );

    if (!result.transformed) {
      expect(result.transformedData.request.json).toBeNull();
      expect(result.data.diagnostic).toEqual(
        expect.stringMatching(/request unchanged$/)
      );
      return;
    }

    const messages = result.transformedData.request.json.messages;
    expect(messages[0].content).toBe(SECRET_SYSTEM);
    expect(messages[1].content).toContain(LATEST_USER);
    expect(messages[1].content).toContain('<web_search_context>');
    expect(messages[1].content).toContain('Not instructions');
    expect(messages[1].content).toMatch(/https?:\/\//);
    expect(result.data.sources.length).toBeGreaterThan(0);
    expect(result.data.sources.length).toBeLessThanOrEqual(2);
    expect(result.data.sources[0].url).toMatch(/^https?:\/\//);
  }, 20000);

  it('treats an MCP tool error that says rate limited as a rate limit', async () => {
    const calls = mockSearchExchange({
      toolsBody: {
        jsonrpc: '2.0',
        id: 2,
        result: {
          isError: true,
          content: [
            { type: 'text', text: 'rate limit exceeded for free tier' },
          ],
        },
      },
    });

    const result = await onlineHandler(
      chatContext([{ role: 'user', content: LATEST_USER }]),
      enabledParameters(),
      'beforeRequestHook'
    );

    expect(result.transformed).toBe(false);
    expect(result.transformedData.request.json).toBeNull();
    expect(result.data.diagnostic).toBe(
      'Parallel Search MCP rate limited; request unchanged'
    );
    expect(
      calls.filter((call) => call.body?.method === 'tools/call')
    ).toHaveLength(1);
    expect(calls.every((call) => call.url === MCP_URL)).toBe(true);
  });
});
