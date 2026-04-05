import { AnthropicChatCompleteConfig } from './chatComplete';

describe('AnthropicChatCompleteConfig', () => {
  describe('cache_control.scope preservation in message transforms', () => {
    const getMessagesTransform = () => {
      const messagesConfig = AnthropicChatCompleteConfig.messages;
      // messages is an array of param configs; the first one transforms messages
      return Array.isArray(messagesConfig)
        ? messagesConfig[0].transform!
        : messagesConfig.transform!;
    };

    const getSystemTransform = () => {
      const messagesConfig = AnthropicChatCompleteConfig.messages;
      // the second param config in the messages array transforms system messages
      return Array.isArray(messagesConfig)
        ? messagesConfig[1].transform!
        : undefined;
    };

    it('should preserve cache_control with scope on text content items', () => {
      const transform = getMessagesTransform();
      const params = {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                cache_control: { type: 'ephemeral', scope: 'global' },
              },
            ],
          },
        ],
      };

      const result = transform(params, {} as any);
      expect(result[0].content[0].cache_control).toEqual({
        type: 'ephemeral',
        scope: 'global',
      });
    });

    it('should preserve cache_control without scope (backward compat)', () => {
      const transform = getMessagesTransform();
      const params = {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
      };

      const result = transform(params, {} as any);
      expect(result[0].content[0].cache_control).toEqual({
        type: 'ephemeral',
      });
    });

    it('should strip unknown fields from cache_control', () => {
      const transform = getMessagesTransform();
      const params = {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                cache_control: {
                  type: 'ephemeral',
                  scope: 'global',
                  malicious_field: 'should be stripped',
                },
              },
            ],
          },
        ],
      };

      const result = transform(params, {} as any);
      expect(result[0].content[0].cache_control).toEqual({
        type: 'ephemeral',
        scope: 'global',
      });
      expect(result[0].content[0].cache_control).not.toHaveProperty(
        'malicious_field'
      );
    });

    it('should not include cache_control when not present in source', () => {
      const transform = getMessagesTransform();
      const params = {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      };

      const result = transform(params, {} as any);
      expect(result[0].content[0]).not.toHaveProperty('cache_control');
    });

    it('should preserve cache_control with scope on system messages (array form)', () => {
      const transform = getSystemTransform();
      if (!transform) throw new Error('System transform not found');

      const params = {
        messages: [
          {
            role: 'system',
            content: [
              {
                text: 'You are helpful',
                cache_control: { type: 'ephemeral', scope: 'global' },
              },
            ],
          },
        ],
      };

      const result = transform(params, {} as any);
      expect(result[0].cache_control).toEqual({
        type: 'ephemeral',
        scope: 'global',
      });
    });

    it('should preserve cache_control with scope on system messages (string form)', () => {
      const transform = getSystemTransform();
      if (!transform) throw new Error('System transform not found');

      const params = {
        messages: [
          {
            role: 'system',
            content: 'You are helpful',
            cache_control: { type: 'ephemeral', scope: 'global' },
          },
        ],
      };

      const result = transform(params, {} as any);
      expect(result[0].cache_control).toEqual({
        type: 'ephemeral',
        scope: 'global',
      });
    });
  });

  describe('cache_control.scope preservation in tool transforms', () => {
    const getToolsTransform = () => {
      const toolsConfig = AnthropicChatCompleteConfig.tools;
      return Array.isArray(toolsConfig)
        ? toolsConfig[0].transform!
        : (toolsConfig as any).transform!;
    };

    it('should preserve cache_control with scope on function tools', () => {
      const transform = getToolsTransform();
      const params = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: {}, required: [] },
            },
            cache_control: { type: 'ephemeral', scope: 'global' },
          },
        ],
      };

      const result = transform(params, {} as any);
      expect(result[0].cache_control).toEqual({
        type: 'ephemeral',
        scope: 'global',
      });
    });

    it('should strip unknown fields from tool cache_control', () => {
      const transform = getToolsTransform();
      const params = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: {}, required: [] },
            },
            cache_control: {
              type: 'ephemeral',
              scope: 'global',
              injected: true,
            },
          },
        ],
      };

      const result = transform(params, {} as any);
      expect(result[0].cache_control).toEqual({
        type: 'ephemeral',
        scope: 'global',
      });
      expect(result[0].cache_control).not.toHaveProperty('injected');
    });
  });
});
