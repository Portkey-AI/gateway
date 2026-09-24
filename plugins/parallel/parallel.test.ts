import { handler } from './online';
import { PluginContext } from '../types';

const searchResponse = (
  results: Array<{
    url: string;
    title: string;
    publish_date?: string | null;
    excerpts: string[];
  }> = [
    {
      url: 'https://example.com/news',
      title: 'Example result',
      publish_date: '2026-09-24',
      excerpts: ['A current and relevant excerpt.'],
    },
  ]
) => ({
  result: {
    _meta: {
      'parallel/usage': [{ name: 'sku_search', count: 1 }],
    },
    content: [
      {
        type: 'text',
        text: JSON.stringify({ search_id: 'search_123', results }),
      },
    ],
  },
});

const mockFetchResponse = (body: any, ok = true) =>
  ({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Server Error',
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

const chatContext = (withSystemMessage = true): PluginContext => ({
  request: {
    json: {
      model: 'gpt-4o-mini',
      messages: [
        ...(withSystemMessage
          ? [{ role: 'system', content: 'You are a helpful assistant.' }]
          : []),
        { role: 'user', content: 'What happened today?' },
      ],
    },
  },
  requestType: 'chatComplete',
});

describe('parallel online handler', () => {
  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse(searchResponse()));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('only runs before the model request', async () => {
    const result = await handler(chatContext(), {}, 'afterRequestHook');

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('adds Parallel results to an existing system message', async () => {
    const result = await handler(
      chatContext(),
      { numResults: 1 },
      'beforeRequestHook'
    );

    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);
    expect(result.data.sources).toEqual([
      {
        title: 'Example result',
        url: 'https://example.com/news',
        text: 'A current and relevant excerpt.',
        published_date: '2026-09-24',
      },
    ]);

    const content = result.transformedData.request.json.messages[0].content;
    expect(content).toContain('You are a helpful assistant.');
    expect(content).toContain('<web_search_context>');
    expect(content).toContain('untrusted reference material');
    expect(content).toContain('https://example.com/news');
  });

  it('adds a system message when one does not exist', async () => {
    const result = await handler(chatContext(false), {}, 'beforeRequestHook');

    const messages = result.transformedData.request.json.messages;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Example result');
    expect(messages[1].role).toBe('user');
  });

  it('prepends results to completion prompts', async () => {
    const context: PluginContext = {
      request: {
        json: {
          model: 'text-model',
          prompt: 'What happened today?',
        },
      },
      requestType: 'complete',
    };

    const result = await handler(context, {}, 'beforeRequestHook');
    const prompt = result.transformedData.request.json.prompt;

    expect(prompt).toContain('<web_search_context>');
    expect(prompt.indexOf('<web_search_context>')).toBeLessThan(
      prompt.indexOf('What happened today?')
    );
  });

  it('supports anonymous searches without credentials', async () => {
    await handler(chatContext(), {}, 'beforeRequestHook');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers['x-parallel-search-config']).toBeUndefined();
  });

  it('passes credentials and search settings for production use', async () => {
    await handler(
      chatContext(),
      {
        credentials: { apiKey: 'parallel-key' },
        mode: 'basic',
        numResults: 3,
        includeDomains: ['example.com'],
        excludeDomains: ['blog.example.com'],
      },
      'beforeRequestHook'
    );

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    const config = JSON.parse(options.headers['x-parallel-search-config']);

    expect(options.headers.Authorization).toBe('Bearer parallel-key');
    expect(config).toEqual({
      mode: 'basic',
      advanced_settings: {
        max_results: 3,
        source_policy: {
          include_domains: ['example.com'],
          exclude_domains: ['blog.example.com'],
        },
      },
    });
    expect(body.params.name).toBe('web_search');
    expect(body.params.arguments.model_name).toBe('gpt-4o-mini');
  });

  it('limits injected results locally', async () => {
    const results = Array.from({ length: 4 }, (_, index) => ({
      url: `https://example.com/${index}`,
      title: `Result ${index}`,
      excerpts: [`Excerpt ${index}`],
    }));
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse(searchResponse(results))
    );

    const result = await handler(
      chatContext(),
      { numResults: 2 },
      'beforeRequestHook'
    );

    expect(result.data.sources).toHaveLength(2);
    expect(
      result.transformedData.request.json.messages[0].content
    ).not.toContain('Result 2');
  });

  it('caps the amount of search context added to the prompt', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse(
        searchResponse([
          {
            url: 'https://example.com/long',
            title: 'Long result',
            excerpts: ['x'.repeat(500)],
          },
        ])
      )
    );

    const result = await handler(
      chatContext(),
      { maxContextChars: 50 },
      'beforeRequestHook'
    );
    const content = result.transformedData.request.json.messages[0].content;

    expect(content).toContain('[Additional search context truncated]');
    expect(content).not.toContain('x'.repeat(100));
  });

  it('fails open when Parallel search is unavailable', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ message: 'unavailable' }, false)
    );

    const result = await handler(chatContext(), {}, 'beforeRequestHook');

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(result.data.error).toBeDefined();
    expect(consoleError).toHaveBeenCalled();
  });
});
