import testCreds from './.creds.json';
import { handler as onlineHandler } from './online';
import { PluginContext } from '../types';

// This test file makes real API calls to Exa
describe('exa online handler', () => {
  // Setting longer timeout for API calls
  jest.setTimeout(30000);

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
      numResults: 1,
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
  });

  it('should enhance chat completion request by appending search results to system message', async () => {
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
      numResults: 1,
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
    // We can't check for specific content since it's real API results
    expect(messages[0].content.length).toBeGreaterThan(100); // Should have substantial content
  });

  it('should add new system message if none exists', async () => {
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
      numResults: 1,
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
      numResults: 1,
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

  it('should include source metadata in the response data', async () => {
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
      numResults: 1,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.sources).toBeDefined();
    expect(result.data.sources.length).toBeGreaterThan(0);
    // Check that sources have the right structure
    expect(result.data.sources[0]).toHaveProperty('title');
    expect(result.data.sources[0]).toHaveProperty('url');
  });

  it('should filter results using includeDomains parameter', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Latest news on climate change',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Latest news on climate change',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      credentials: testCreds,
      includeDomains: ['theguardian.com', 'bbc.com'],
      numResults: 3,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    // We might not get results if the domains don't have matching content
    if (result.transformed) {
      expect(result.data.sources.length).toBeGreaterThan(0);

      // Check that all results come from the included domains
      // Note: This test might be flaky if Exa doesn't return results from these domains
      const allResultsFromIncludedDomains = result.data.sources.every(
        (source: { url: string | URL }) => {
          const domain = new URL(source.url).hostname;
          return parameters.includeDomains.some(
            (includeDomain) =>
              domain === includeDomain || domain.endsWith('.' + includeDomain)
          );
        }
      );

      // Only check if we actually got sources
      if (result.data.sources.length > 0) {
        expect(allResultsFromIncludedDomains).toBe(true);
      }
    }
  });

  it('should filter results using excludeDomains parameter', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Latest iPhone reviews',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Latest iPhone reviews',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      credentials: testCreds,
      excludeDomains: ['wikipedia.org', 'reddit.com'],
      numResults: 3,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    if (result.transformed && result.data.sources.length > 0) {
      // Check that no results come from excluded domains
      const noResultsFromExcludedDomains = result.data.sources.every(
        (source: { url: string | URL }) => {
          const domain = new URL(source.url).hostname;
          return !parameters.excludeDomains.some(
            (excludeDomain) =>
              domain === excludeDomain || domain.endsWith('.' + excludeDomain)
          );
        }
      );

      expect(noResultsFromExcludedDomains).toBe(true);
    }
  });

  it('should limit results based on numResults parameter', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Latest AI research papers',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Latest AI research papers',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    // Test with a small number to clearly verify the limit
    const specificNumResults = 2;
    const parameters = {
      credentials: testCreds,
      numResults: specificNumResults,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    if (result.transformed) {
      // Verify we got the exact number of results requested (or fewer if not enough available)
      expect(result.data.sources.length).toBeLessThanOrEqual(
        specificNumResults
      );

      // If we got results, check the content structure in the transformed result
      if (result.transformedData.request.json.messages[0].content) {
        const content = result.transformedData.request.json.messages[0].content;

        // Count the number of result entries in the content
        // Each result starts with a number in brackets like [1], [2], etc.
        const resultCount = (content.match(/\[\d+\]/g) || []).length;
        expect(resultCount).toBeLessThanOrEqual(specificNumResults);
      }
    }
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
      numResults: 1,
    };

    const result = await onlineHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
  });
});
