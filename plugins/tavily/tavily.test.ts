import { handler as onlineHandler } from './online';
import { PluginContext } from '../types';

const defaultSearchResult = {
  title: 'Latest AI Research',
  url: 'https://example.com/ai-research',
  content: 'A summary of the latest research progress in AI.',
  score: 0.91,
  raw_content: 'Full article text.',
  favicon: 'https://example.com/favicon.ico',
};

const createMockSearchResponse = (overrides: Record<string, any> = {}) => ({
  query: 'What are recent advances in AI?',
  images: [],
  results: [defaultSearchResult],
  response_time: 0.87,
  request_id: 'test-request-id',
  ...overrides,
});

const mockFetchResponse = (responseData = createMockSearchResponse()) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => responseData,
  } as Response);
};

describe('tavily online handler', () => {
  beforeEach(() => {
    mockFetchResponse();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should only run on beforeRequestHook', async () => {
    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          messages: [
            {
              role: 'user',
              content: 'What are recent advances in AI?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
      },
      'afterRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should enhance chat completion requests by appending search results to the system message', async () => {
    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: 'What are recent advances in AI?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
      },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const messages = result.transformedData?.request?.json?.messages;

    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('You are a helpful assistant.');
    expect(messages[0].content).toContain('<web_search_context>');
    expect(messages[0].content).toContain('Latest AI Research');
    expect(messages[0].content).toContain('https://example.com/ai-research');
  });

  it('should add a new system message if none exists', async () => {
    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          messages: [
            {
              role: 'user',
              content: 'What are recent advances in AI?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
      },
      'beforeRequestHook'
    );

    const messages = result.transformedData?.request?.json?.messages;

    expect(result.transformed).toBe(true);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('<web_search_context>');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('What are recent advances in AI?');
  });

  it('should use custom prefix and suffix for injected search results', async () => {
    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: 'What are recent advances in AI?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        prefix: '\n[SEARCH_RESULTS]',
        suffix: '[END_RESULTS]\n',
      },
      'beforeRequestHook'
    );

    const content = result.transformedData?.request?.json?.messages[0].content;

    expect(result.transformed).toBe(true);
    expect(content).toContain('[SEARCH_RESULTS]');
    expect(content).not.toContain('<web_search_context>');
    expect(content).toContain('[END_RESULTS]');
    expect(content).not.toContain('</web_search_context>');
  });

  it('should handle completion requests by prepending search results to the prompt', async () => {
    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          prompt: 'What are recent advances in AI?',
        },
      },
      requestType: 'complete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
      },
      'beforeRequestHook'
    );

    const prompt = result.transformedData?.request?.json?.prompt;

    expect(result.transformed).toBe(true);
    expect(prompt).toContain('<web_search_context>');
    expect(prompt).toContain('What are recent advances in AI?');
    expect(prompt.indexOf('<web_search_context>')).toBeLessThan(
      prompt.indexOf('What are recent advances in AI?')
    );
  });

  it('should inject object images with descriptions into the prompt', async () => {
    mockFetchResponse(
      createMockSearchResponse({
        images: [
          {
            url: 'https://example.com/query-image.png',
            description: 'Query image',
          },
        ],
        results: [
          {
            ...defaultSearchResult,
            images: [
              {
                url: 'https://example.com/result-image.png',
                description: 'Result image',
              },
            ],
          },
        ],
      })
    );

    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: 'What are recent advances in AI?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        includeImages: true,
        includeImageDescriptions: true,
      },
      'beforeRequestHook'
    );

    const content = result.transformedData?.request?.json?.messages[0].content;

    expect(content).toContain('Query-Related Images:');
    expect(content).toContain('https://example.com/query-image.png');
    expect(content).toContain('Description: Query image');
    expect(content).toContain('Result 1 Images:');
    expect(content).toContain('https://example.com/result-image.png');
    expect(content).toContain('Description: Result image');
  });

  it('should inject string image URLs into the prompt', async () => {
    mockFetchResponse(
      createMockSearchResponse({
        images: ['https://example.com/query-image.png'],
        results: [
          {
            ...defaultSearchResult,
            images: ['https://example.com/result-image.png'],
          },
        ],
      })
    );

    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: 'What are recent advances in AI?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        includeImages: true,
      },
      'beforeRequestHook'
    );

    const content = result.transformedData?.request?.json?.messages[0].content;

    expect(content).toContain('Query-Related Images:');
    expect(content).toContain('Image 1: https://example.com/query-image.png');
    expect(content).toContain('Result 1 Images:');
    expect(content).toContain('Image 1: https://example.com/result-image.png');
  });

  it('should limit prompt image injection to the first five valid images', async () => {
    mockFetchResponse(
      createMockSearchResponse({
        images: [
          'https://example.com/image-1.png',
          'https://example.com/image-2.png',
          'https://example.com/image-3.png',
          'https://example.com/image-4.png',
          'https://example.com/image-5.png',
          'https://example.com/image-6.png',
        ],
      })
    );

    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: 'What are recent advances in AI?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        includeImages: true,
      },
      'beforeRequestHook'
    );

    const content = result.transformedData?.request?.json?.messages[0].content;

    expect(content).toContain('https://example.com/image-1.png');
    expect(content).toContain('https://example.com/image-5.png');
    expect(content).not.toContain('https://example.com/image-6.png');
  });

  it('should map Tavily request parameters, send the client source header, and include source metadata', async () => {
    mockFetchResponse(
      createMockSearchResponse({
        results: [
          {
            ...defaultSearchResult,
            images: [
              {
                url: 'https://example.com/result-image.png',
                description: 'Result image',
              },
            ],
          },
        ],
      })
    );

    const context = {
      request: {
        text: 'Latest climate change news',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Latest climate change news',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 3,
        searchDepth: 'advanced',
        chunksPerSource: 2,
        topic: 'general',
        timeRange: 'week',
        startDate: '2026-04-01',
        endDate: '2026-04-14',
        includeAnswer: 'basic',
        includeRawContent: 'text',
        includeImages: true,
        includeImageDescriptions: true,
        includeFavicon: true,
        includeDomains: ['bbc.com'],
        excludeDomains: ['reddit.com'],
        country: 'india',
        exactMatch: true,
        includeUsage: true,
        safeSearch: true,
        timeout: 1234,
      },
      'beforeRequestHook'
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.tavily.com/search');
    expect(options.headers.Authorization).toBe('Bearer tvly-test-key');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-Client-Source']).toBe('portkey-ai');

    const parsedBody = JSON.parse(options.body);
    expect(parsedBody.max_results).toBe(3);
    expect(parsedBody.search_depth).toBe('advanced');
    expect(parsedBody.chunks_per_source).toBe(2);
    expect(parsedBody.topic).toBe('general');
    expect(parsedBody.time_range).toBe('week');
    expect(parsedBody.start_date).toBe('2026-04-01');
    expect(parsedBody.end_date).toBe('2026-04-14');
    expect(parsedBody.include_answer).toBe('basic');
    expect(parsedBody.include_raw_content).toBe('text');
    expect(parsedBody.include_images).toBe(true);
    expect(parsedBody.include_image_descriptions).toBe(true);
    expect(parsedBody.include_favicon).toBe(true);
    expect(parsedBody.include_domains).toEqual(['bbc.com']);
    expect(parsedBody.exclude_domains).toEqual(['reddit.com']);
    expect(parsedBody.country).toBe('india');
    expect(parsedBody.exact_match).toBe(true);
    expect(parsedBody.include_usage).toBe(true);
    expect(parsedBody.safe_search).toBe(true);

    expect(result.data.sources).toEqual([
      {
        title: 'Latest AI Research',
        url: 'https://example.com/ai-research',
        text: 'A summary of the latest research progress in AI.',
        score: 0.91,
        raw_content: 'Full article text.',
        favicon: 'https://example.com/favicon.ico',
        images: [
          {
            url: 'https://example.com/result-image.png',
            description: 'Result image',
          },
        ],
      },
    ]);
  });

  it('should let Tavily choose topic and search depth when autoParameters is enabled', async () => {
    const context = {
      request: {
        text: 'What are the latest developments in AI chips?',
        json: {
          messages: [
            {
              role: 'user',
              content: 'What are the latest developments in AI chips?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        autoParameters: true,
        maxResults: 1,
        safeSearch: true,
      },
      'beforeRequestHook'
    );

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const parsedBody = JSON.parse(options.body);

    expect(parsedBody.auto_parameters).toBe(true);
    expect(parsedBody.topic).toBeUndefined();
    expect(parsedBody.search_depth).toBeUndefined();
    expect(parsedBody.safe_search).toBeUndefined();
  });

  it('should omit chunks per source when search depth is not advanced or fast', async () => {
    const context = {
      request: {
        text: 'Latest design system news',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Latest design system news',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
        searchDepth: 'basic',
        chunksPerSource: 2,
      },
      'beforeRequestHook'
    );

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const parsedBody = JSON.parse(options.body);

    expect(parsedBody.search_depth).toBe('basic');
    expect(parsedBody.chunks_per_source).toBeUndefined();
  });

  it('should include chunks per source for fast search depth', async () => {
    const context = {
      request: {
        text: 'Latest robotics news',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Latest robotics news',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
        searchDepth: 'fast',
        chunksPerSource: 2,
      },
      'beforeRequestHook'
    );

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const parsedBody = JSON.parse(options.body);

    expect(parsedBody.search_depth).toBe('fast');
    expect(parsedBody.chunks_per_source).toBe(2);
  });

  it('should omit image descriptions when images are not requested', async () => {
    const context = {
      request: {
        text: 'Latest design system news',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Latest design system news',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
        includeImages: false,
        includeImageDescriptions: true,
      },
      'beforeRequestHook'
    );

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const parsedBody = JSON.parse(options.body);

    expect(parsedBody.include_images).toBe(false);
    expect(parsedBody.include_image_descriptions).toBeUndefined();
  });

  it('should omit safe search for fast search depths', async () => {
    const context = {
      request: {
        text: 'Latest robotics news',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Latest robotics news',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
        searchDepth: 'fast',
        safeSearch: true,
      },
      'beforeRequestHook'
    );

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const parsedBody = JSON.parse(options.body);

    expect(parsedBody.search_depth).toBe('fast');
    expect(parsedBody.safe_search).toBeUndefined();
  });

  it('should omit country when topic is not general', async () => {
    const context = {
      request: {
        text: 'What is the latest political news?',
        json: {
          messages: [
            {
              role: 'user',
              content: 'What is the latest political news?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        topic: 'news',
        country: 'india',
      },
      'beforeRequestHook'
    );

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const parsedBody = JSON.parse(options.body);

    expect(parsedBody.topic).toBe('news');
    expect(parsedBody.country).toBeUndefined();
  });

  it('should handle empty queries gracefully', async () => {
    const context = {
      request: {
        text: '',
        json: {
          messages: [
            {
              role: 'user',
              content: '',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: { apiKey: 'tvly-test-key' },
        maxResults: 1,
      },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
