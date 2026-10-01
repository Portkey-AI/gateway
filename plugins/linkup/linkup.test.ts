// Mock fetch
global.fetch = jest.fn();
import { handler as onlineHandler } from './online';
import { PluginContext } from '../types';

const testCreds = { apiKey: 'test-api-key' };

const mockResults = [
  {
    type: 'text',
    name: 'Recent advances in AI',
    url: 'https://www.bbc.com/news/ai-advances',
    content: 'A summary of the latest advances in artificial intelligence.',
    favicon: 'https://www.bbc.com/favicon.ico',
  },
  {
    type: 'text',
    name: 'AI research roundup',
    url: 'https://www.theguardian.com/technology/ai-roundup',
    content: 'This week in AI research.',
    favicon: 'https://www.theguardian.com/favicon.ico',
  },
  {
    type: 'image',
    name: 'AI chart',
    url: 'https://example.com/chart.png',
  },
];

const mockSearchResponse = (results: any[] = mockResults) => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ results }),
  });
};

const getRequestBody = () =>
  JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);

describe('linkup online handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only run on beforeRequestHook', async () => {
    const eventType = 'afterRequestHook';
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

    const parameters = {
      credentials: testCreds,
      maxResults: 1,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should call the Linkup search API with the expected request', async () => {
    mockSearchResponse();
    const eventType = 'beforeRequestHook';
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

    const parameters = {
      credentials: testCreds,
      maxResults: 3,
      depth: 'deep',
      includeDomains: ['bbc.com'],
      excludeDomains: ['reddit.com'],
    };

    await onlineHandler(context as PluginContext, parameters, eventType);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.linkup.so/v1/search');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-api-key');
    expect(getRequestBody()).toEqual({
      q: 'What are recent advances in AI?',
      depth: 'deep',
      outputType: 'searchResults',
      maxResults: 3,
      includeDomains: ['bbc.com'],
      excludeDomains: ['reddit.com'],
    });
  });

  it('should use default depth and maxResults when not provided', async () => {
    mockSearchResponse();
    const eventType = 'beforeRequestHook';
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

    const parameters = {
      credentials: testCreds,
    };

    await onlineHandler(context as PluginContext, parameters, eventType);

    const body = getRequestBody();
    expect(body.depth).toBe('standard');
    expect(body.maxResults).toBe(5);
    expect(body).not.toHaveProperty('includeDomains');
    expect(body).not.toHaveProperty('excludeDomains');
  });

  it('should enhance chat completion request by appending search results to system message', async () => {
    mockSearchResponse();
    const eventType = 'beforeRequestHook';
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

    const parameters = {
      credentials: testCreds,
      maxResults: 2,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    // Check that system message was enhanced
    const messages = result.transformedData.request.json.messages;

    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('You are a helpful assistant.');
    expect(messages[0].content).toContain('<web_search_context>');
    expect(messages[0].content).toContain('[1] "Recent advances in AI"');
    expect(messages[0].content).toContain(
      'URL: https://www.bbc.com/news/ai-advances'
    );
    expect(messages[0].content).toContain(
      'A summary of the latest advances in artificial intelligence.'
    );
  });

  it('should add new system message if none exists', async () => {
    mockSearchResponse();
    const eventType = 'beforeRequestHook';
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

    const parameters = {
      credentials: testCreds,
      maxResults: 1,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    // Check that a new system message was added
    const messages = result.transformedData.request.json.messages;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('<web_search_context>');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('What are recent advances in AI?');
  });

  it('should use custom prefix and suffix for search results', async () => {
    mockSearchResponse();
    const eventType = 'beforeRequestHook';
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

    const parameters = {
      credentials: testCreds,
      prefix: '\n[SEARCH_RESULTS]',
      suffix: '[END_RESULTS]\n',
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    // Check custom formatting
    const content = result.transformedData.request.json.messages[0].content;
    expect(content).toContain('[SEARCH_RESULTS]');
    expect(content).not.toContain('<web_search_context>');
    expect(content).toContain('[END_RESULTS]');
    expect(content).not.toContain('</web_search_context>');
  });

  it('should handle completion requests by prepending search results', async () => {
    mockSearchResponse();
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          prompt: 'What are recent advances in AI?',
        },
      },
      requestType: 'complete',
    };

    const parameters = {
      credentials: testCreds,
      maxResults: 1,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    // Check that prompt was enhanced
    const prompt = result.transformedData.request.json.prompt;
    expect(prompt).toContain('<web_search_context>');
    expect(prompt).toContain('What are recent advances in AI?');
    expect(prompt.indexOf('<web_search_context>')).toBeLessThan(
      prompt.indexOf('What are recent advances in AI?')
    );
  });

  it('should include source metadata in the response data and skip image results', async () => {
    mockSearchResponse();
    const eventType = 'beforeRequestHook';
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

    const parameters = {
      credentials: testCreds,
      maxResults: 3,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.sources).toEqual([
      {
        title: 'Recent advances in AI',
        url: 'https://www.bbc.com/news/ai-advances',
        text: 'A summary of the latest advances in artificial intelligence.',
      },
      {
        title: 'AI research roundup',
        url: 'https://www.theguardian.com/technology/ai-roundup',
        text: 'This week in AI research.',
      },
    ]);
    expect(
      result.transformedData.request.json.messages[0].content
    ).not.toContain('AI chart');
  });

  it('should not transform the request when no results are returned', async () => {
    mockSearchResponse([]);
    const eventType = 'beforeRequestHook';
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

    const parameters = {
      credentials: testCreds,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should allow the request to continue when the Linkup API returns an error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('{"error":"Invalid API key"}'),
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const eventType = 'beforeRequestHook';
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

    const parameters = {
      credentials: { apiKey: 'invalid-key' },
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );
    consoleSpy.mockRestore();

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(result.data.error).toBeDefined();
  });

  it('should handle invalid queries gracefully', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: '', // Empty query
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

    const parameters = {
      credentials: testCreds,
      maxResults: 1,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
