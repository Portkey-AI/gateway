global.fetch = jest.fn();

import { handler as onlineHandler } from './online';
import { PluginContext } from '../types';

const testCreds = { apiKey: 'test-specstream-key' };

const mockSources = [
  {
    title: 'SpecStream Benchmark Results',
    url: 'https://specstream.ai/benchmarks',
    snippet: 'Live web search benchmark scores.',
    excerpt:
      'Detailed benchmark results across WideSearch and SimpleQA Verified.',
    published: '2026-11-23',
  },
  {
    title: 'SpecStream Search API Docs',
    url: 'https://specstream.ai/docs/search-api',
    snippet: 'Search API reference and pricing.',
  },
];

const mockSearchResponse = (sources: any[] = mockSources) => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          query: 'latest AI search benchmarks',
          sources,
          took_ms: 850,
        },
      }),
  });
};

const getRequestInit = () => (global.fetch as jest.Mock).mock.calls[0][1];
const getRequestBody = () => JSON.parse(getRequestInit().body);

describe('specstream online handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only run on beforeRequestHook', async () => {
    const context = {
      request: {
        text: 'What are recent advances in AI?',
        json: {
          messages: [
            { role: 'user', content: 'What are recent advances in AI?' },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      { credentials: testCreds },
      'afterRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should ignore unsupported request types', async () => {
    const context = {
      request: {
        text: 'hello',
        json: { input: 'hello' },
      },
      requestType: 'embed',
    };

    const result = await onlineHandler(
      context as PluginContext,
      { credentials: testCreds, timeout: 50 },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should append formatted search results to existing system message on chatComplete', async () => {
    mockSearchResponse();
    const context = {
      request: {
        text: 'latest AI search benchmarks',
        json: {
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'latest AI search benchmarks' },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      { credentials: testCreds, numResults: 5 },
      'beforeRequestHook'
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://api.specstream.ai/v1/web-search'
    );
    expect(getRequestInit().headers.Authorization).toBe(
      'Bearer test-specstream-key'
    );
    expect(getRequestBody()).toEqual({
      q: 'latest AI search benchmarks',
      num: 5,
      speed: 'default',
      passages: true,
    });

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const messages = result.transformedData.request.json.messages;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('You are a helpful assistant.');
    expect(messages[0].content).toContain('<web_search_context>');
    expect(messages[0].content).toContain('SpecStream Benchmark Results');
    expect(messages[0].content).toContain('Date: 2026-11-23');
    expect(messages[0].content).toContain(
      'Detailed benchmark results across WideSearch and SimpleQA Verified.'
    );
    expect(messages[0].content).toContain('Search API reference and pricing.');
    expect(result.data.sources).toHaveLength(2);
  });

  it('should prepend a new system message when none exists', async () => {
    mockSearchResponse();
    const context = {
      request: {
        text: 'latest AI search benchmarks',
        json: {
          messages: [{ role: 'user', content: 'latest AI search benchmarks' }],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      { credentials: testCreds, timeout: 50 },
      'beforeRequestHook'
    );

    const messages = result.transformedData.request.json.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('<web_search_context>');
    expect(messages[1].role).toBe('user');
  });

  it('should support completion requests and custom prefix/suffix', async () => {
    mockSearchResponse();
    const context = {
      request: {
        text: 'Summarize live benchmarks.',
        json: {
          prompt: 'Summarize live benchmarks.',
        },
      },
      requestType: 'complete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      {
        credentials: testCreds,
        prefix: '<ctx>',
        suffix: '</ctx>\n',
        speed: 'fast',
      },
      'beforeRequestHook'
    );

    expect(getRequestBody()).toEqual({
      q: 'Summarize live benchmarks.',
      num: 5,
      speed: 'fast',
    });
    expect(result.transformed).toBe(true);
    expect(result.transformedData.request.json.prompt).toContain('<ctx>');
    expect(result.transformedData.request.json.prompt).toContain('</ctx>\n');
    expect(result.transformedData.request.json.prompt).toContain(
      'Summarize live benchmarks.'
    );
  });

  it('should encode includeDomains and excludeDomains as search operators', async () => {
    mockSearchResponse();
    const context = {
      request: {
        text: 'quarterly earnings',
        json: {
          messages: [{ role: 'user', content: 'quarterly earnings' }],
        },
      },
      requestType: 'chatComplete',
    };

    await onlineHandler(
      context as PluginContext,
      {
        credentials: testCreds,
        includeDomains: ['sec.gov', 'reuters.com'],
        excludeDomains: ['reddit.com'],
      },
      'beforeRequestHook'
    );

    expect(getRequestBody().q).toBe(
      'quarterly earnings (site:sec.gov OR site:reuters.com) -site:reddit.com'
    );
  });

  it('should fail open when API returns an error or empty results', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('network down')
    );
    const context = {
      request: {
        text: 'test query',
        json: {
          messages: [{ role: 'user', content: 'test query' }],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await onlineHandler(
      context as PluginContext,
      { credentials: testCreds, timeout: 50 },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
    expect(result.data.error).toBeDefined();
  });
});
