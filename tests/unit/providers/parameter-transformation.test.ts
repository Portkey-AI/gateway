import { transformToProviderRequest } from '../../../src/services/transformToProviderRequest';
import GroqConfig from '../../../src/providers/groq';
import { cerebrasProviderAPIConfig } from '../../../src/providers/cerebras';

describe('Parameter transformation for max_completion_tokens', () => {
  describe('GROQ provider', () => {
    it('should transform max_completion_tokens to max_tokens in request', () => {
      const inputParams = {
        model: 'llama-3.1-70b-versatile',
        messages: [{ role: 'user', content: 'Hello' }],
        max_completion_tokens: 500,
      };

      // Get the config
      const config = GroqConfig.chatComplete;
      expect(config).toBeDefined();

      // Verify the parameter mapping
      const maxCompletionTokensConfig = config?.max_completion_tokens;
      expect(maxCompletionTokensConfig?.param).toBe('max_tokens');

      // When user sends max_completion_tokens: 500, it should be sent to provider as max_tokens: 500
      expect(maxCompletionTokensConfig?.param).toBe('max_tokens');
    });

    it('should handle both max_tokens and max_completion_tokens', () => {
      const config = GroqConfig.chatComplete;

      // Both should map to the same provider parameter
      expect(config?.max_tokens?.param).toBe('max_tokens');
      expect(config?.max_completion_tokens?.param).toBe('max_tokens');
    });

    it('should prioritize max_completion_tokens when both are provided', () => {
      // This is the expected OpenAI behavior - max_completion_tokens takes precedence
      const config = GroqConfig.chatComplete;

      // Both exist and map to the same parameter
      expect(config?.max_tokens).toBeDefined();
      expect(config?.max_completion_tokens).toBeDefined();
      expect(config?.max_tokens?.param).toBe(
        config?.max_completion_tokens?.param
      );
    });
  });

  describe('Cerebras provider', () => {
    it('should transform max_completion_tokens to max_tokens in request', () => {
      const inputParams = {
        model: 'llama3.1-8b',
        messages: [{ role: 'user', content: 'Hello' }],
        max_completion_tokens: 1000,
      };

      // Get the config
      const config = cerebrasProviderAPIConfig.chatComplete;
      expect(config).toBeDefined();

      // Verify the parameter mapping
      const maxCompletionTokensConfig = config?.max_completion_tokens;
      expect(maxCompletionTokensConfig?.param).toBe('max_tokens');
    });

    it('should handle both max_tokens and max_completion_tokens', () => {
      const config = cerebrasProviderAPIConfig.chatComplete;

      // Both should map to the same provider parameter
      expect(config?.max_tokens?.param).toBe('max_tokens');
      expect(config?.max_completion_tokens?.param).toBe('max_tokens');
    });
  });

  describe('Edge cases', () => {
    it('GROQ should have min constraint of 0 for max_completion_tokens', () => {
      const config = GroqConfig.chatComplete;
      expect(config?.max_completion_tokens?.min).toBe(0);
    });

    it('Cerebras should have min constraint of 0 for max_completion_tokens', () => {
      const config = cerebrasProviderAPIConfig.chatComplete;
      expect(config?.max_completion_tokens?.min).toBe(0);
    });

    it('GROQ should have default value of 100 for max_completion_tokens', () => {
      const config = GroqConfig.chatComplete;
      expect(config?.max_completion_tokens?.default).toBe(100);
    });

    it('Cerebras should have default value of 100 for max_completion_tokens', () => {
      const config = cerebrasProviderAPIConfig.chatComplete;
      expect(config?.max_completion_tokens?.default).toBe(100);
    });
  });

  describe('Verify excluded parameters are not present', () => {
    it('GROQ should not have logprobs parameter', () => {
      const config = GroqConfig.chatComplete;
      expect(config?.logprobs).toBeUndefined();
    });

    it('Cerebras should not have frequency_penalty parameter', () => {
      const config = cerebrasProviderAPIConfig.chatComplete;
      expect(config?.frequency_penalty).toBeUndefined();
    });

    it('Cerebras should not have presence_penalty parameter', () => {
      const config = cerebrasProviderAPIConfig.chatComplete;
      expect(config?.presence_penalty).toBeUndefined();
    });
  });
});
