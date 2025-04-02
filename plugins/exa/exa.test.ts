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
      num_results: 1,
      insert_location: 'append_to_system',
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

  it('should enhance chat completion request with search results appended to system message', async () => {
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
      insert_location: 'append_to_system',
      num_results: 1,
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

    console.log(messages);
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
      insert_location: 'append_to_system',
      num_results: 1,
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

  it('should add a user message after system with search results', async () => {
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
      insert_location: 'add_user_after_system',
      num_results: 1,
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

    // Check that a new user message was added after system
    const messages = result.transformedData.request.json.messages;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('You are a helpful assistant.');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('<web_search_context>');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toBe('What are recent advances in AI?');
  });

  it('should add a user message at the end with search results', async () => {
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
      insert_location: 'add_user_to_end',
      num_results: 1,
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

    // Check that a new user message was added at the end
    const messages = result.transformedData.request.json.messages;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('You are a helpful assistant.');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('What are recent advances in AI?');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toContain('<web_search_context>');
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
      insert_location: 'append_to_system',
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
      insert_location: 'append_to_system', // Should still work for completion
      num_results: 1,
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
      num_results: 1,
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
      num_results: 1,
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
