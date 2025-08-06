import { handler as addPrefixHandler } from './addPrefix';
import { PluginContext } from '../types';

describe('prefix addPrefix handler', () => {
  it('should only run on beforeRequestHook', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      request: {
        text: 'Hello world',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Hello world',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'Please respond helpfully: ',
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should add prefix to existing user message in chat completion', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Hello world',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Hello world',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'Please respond helpfully: ',
      applyToRole: 'user',
      addToExisting: true,
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const messages = result.transformedData.request.json.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Please respond helpfully: Hello world');
  });

  it('should create new user message when none exists', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: '',
        json: {
          messages: [
            {
              role: 'system',
              content: 'You are helpful',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'Please help me: ',
      applyToRole: 'user',
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const messages = result.transformedData.request.json.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Please help me: ');
  });

  it('should add prefix to existing system message', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'System prompt',
        json: {
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'Important: ',
      applyToRole: 'system',
      addToExisting: true,
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const messages = result.transformedData.request.json.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('Important: You are a helpful assistant.');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Hello');
  });

  it('should create new system message when none exists', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Hello',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'You are a helpful assistant. ',
      applyToRole: 'system',
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const messages = result.transformedData.request.json.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('You are a helpful assistant. ');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Hello');
  });

  it('should respect onlyIfEmpty parameter for system messages', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'System prompt',
        json: {
          messages: [
            {
              role: 'system',
              content: 'Existing system message',
            },
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'This should not be added: ',
      applyToRole: 'system',
      onlyIfEmpty: true,
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const messages = result.transformedData.request.json.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('Existing system message'); // Unchanged
  });

  it('should add prefix to completion prompt', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Complete this text',
        json: {
          prompt: 'Complete this text',
        },
      },
      requestType: 'complete',
    };

    const parameters = {
      prefix: 'Please complete the following: ',
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    expect(result.transformedData.request.json.prompt).toBe(
      'Please complete the following: Complete this text'
    );
  });

  it('should create new message instead of adding to existing when addToExisting is false', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Hello world',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Hello world',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'Important instruction: ',
      applyToRole: 'user',
      addToExisting: false,
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(true);

    const messages = result.transformedData.request.json.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Important instruction: ');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Hello world');
  });

  it('should handle missing prefix parameter', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Hello world',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Hello world',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      // Missing prefix parameter
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('Prefix parameter is required');
    expect(result.transformed).toBe(false);
  });

  it('should handle empty request JSON', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Hello world',
        // Missing json property
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'Test prefix: ',
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('Request JSON is empty or missing');
    expect(result.transformed).toBe(false);
  });

  it('should not process unsupported request types', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Hello world',
        json: {
          input: 'Some embedding input',
        },
      },
      requestType: 'embed',
    };

    const parameters = {
      prefix: 'Test prefix: ',
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should return correct data object with operation details', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'Hello world',
        json: {
          messages: [
            {
              role: 'user',
              content: 'Hello world',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = {
      prefix: 'Test prefix: ',
      applyToRole: 'user',
      addToExisting: false,
      onlyIfEmpty: true,
    };

    const result = await addPrefixHandler(
      context as PluginContext,
      parameters,
      eventType
    );

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.prefix).toBe('Test prefix: ');
    expect(result.data.requestType).toBe('chatComplete');
    expect(result.data.applyToRole).toBe('user');
    expect(result.data.addToExisting).toBe(false);
    expect(result.data.onlyIfEmpty).toBe(true);
  });
});
