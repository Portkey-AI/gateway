import GroqConfig from '../../../src/providers/groq';
import { cerebrasProviderAPIConfig } from '../../../src/providers/cerebras';

describe('max_completion_tokens mapping', () => {
  describe('GROQ provider', () => {
    it('should have max_completion_tokens parameter defined', () => {
      expect(GroqConfig.chatComplete).toBeDefined();
      expect(GroqConfig.chatComplete?.max_completion_tokens).toBeDefined();
    });

    it('should map max_completion_tokens to max_tokens', () => {
      const maxCompletionTokensConfig =
        GroqConfig.chatComplete?.max_completion_tokens;
      expect(maxCompletionTokensConfig).toBeDefined();
      expect(maxCompletionTokensConfig?.param).toBe('max_tokens');
    });

    it('should have default value of 100', () => {
      const maxCompletionTokensConfig =
        GroqConfig.chatComplete?.max_completion_tokens;
      expect(maxCompletionTokensConfig?.default).toBe(100);
    });

    it('should have min value of 0', () => {
      const maxCompletionTokensConfig =
        GroqConfig.chatComplete?.max_completion_tokens;
      expect(maxCompletionTokensConfig?.min).toBe(0);
    });

    it('should also have max_tokens parameter that maps to max_tokens', () => {
      const maxTokensConfig = GroqConfig.chatComplete?.max_tokens;
      expect(maxTokensConfig).toBeDefined();
      expect(maxTokensConfig?.param).toBe('max_tokens');
    });
  });

  describe('Cerebras provider', () => {
    it('should have max_completion_tokens parameter defined', () => {
      expect(cerebrasProviderAPIConfig.chatComplete).toBeDefined();
      expect(
        cerebrasProviderAPIConfig.chatComplete?.max_completion_tokens
      ).toBeDefined();
    });

    it('should map max_completion_tokens to max_tokens', () => {
      const maxCompletionTokensConfig =
        cerebrasProviderAPIConfig.chatComplete?.max_completion_tokens;
      expect(maxCompletionTokensConfig).toBeDefined();
      expect(maxCompletionTokensConfig?.param).toBe('max_tokens');
    });

    it('should have default value of 100', () => {
      const maxCompletionTokensConfig =
        cerebrasProviderAPIConfig.chatComplete?.max_completion_tokens;
      expect(maxCompletionTokensConfig?.default).toBe(100);
    });

    it('should have min value of 0', () => {
      const maxCompletionTokensConfig =
        cerebrasProviderAPIConfig.chatComplete?.max_completion_tokens;
      expect(maxCompletionTokensConfig?.min).toBe(0);
    });

    it('should also have max_tokens parameter that maps to max_tokens', () => {
      const maxTokensConfig =
        cerebrasProviderAPIConfig.chatComplete?.max_tokens;
      expect(maxTokensConfig).toBeDefined();
      expect(maxTokensConfig?.param).toBe('max_tokens');
    });
  });

  describe('Comparison with other providers', () => {
    it('GROQ and Cerebras should follow the same pattern as Deepinfra/Fireworks', () => {
      // Both max_tokens and max_completion_tokens should map to the same provider parameter
      const groqMaxTokens = GroqConfig.chatComplete?.max_tokens?.param;
      const groqMaxCompletionTokens =
        GroqConfig.chatComplete?.max_completion_tokens?.param;

      const cerebrasMaxTokens =
        cerebrasProviderAPIConfig.chatComplete?.max_tokens?.param;
      const cerebrasMaxCompletionTokens =
        cerebrasProviderAPIConfig.chatComplete?.max_completion_tokens?.param;

      expect(groqMaxTokens).toBe(groqMaxCompletionTokens);
      expect(cerebrasMaxTokens).toBe(cerebrasMaxCompletionTokens);
      expect(groqMaxTokens).toBe('max_tokens');
      expect(cerebrasMaxTokens).toBe('max_tokens');
    });
  });
});
