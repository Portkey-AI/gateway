/**
 * Unit tests for Oracle model configuration
 */

import {
  getModelConfig,
  getRecommendedMaxTokens,
  modelSupports,
  getKnownModelPrefixes,
} from '../../../../../src/providers/oracle/modelConfig';

describe('Oracle Model Configuration', () => {
  describe('getModelConfig', () => {
    it('should return config for Llama models', () => {
      const config = getModelConfig(
        'meta.llama-4-maverick-17b-128e-instruct-fp8'
      );
      expect(config.family).toBe('meta');
      expect(config.minTokens).toBe(50);
      expect(config.supportsTools).toBe(true);
      expect(config.usesReasoningTokens).toBe(false);
    });

    it('should return config for Gemini models', () => {
      const config = getModelConfig('google.gemini-2.5-flash');
      expect(config.family).toBe('google');
      expect(config.minTokens).toBe(100); // Higher due to reasoning tokens
      expect(config.supportsTools).toBe(true);
      expect(config.usesReasoningTokens).toBe(true);
    });

    it('should return config for Grok models', () => {
      const config = getModelConfig('xai.grok-3-fast');
      expect(config.family).toBe('xai');
      expect(config.supportsTools).toBe(true);
      expect(config.supportsStreaming).toBe(true);
    });

    it('should return config for Grok reasoning models', () => {
      const config = getModelConfig('xai.grok-4-fast-reasoning');
      expect(config.family).toBe('xai');
      expect(config.usesReasoningTokens).toBe(true);
      expect(config.minTokens).toBe(100);
    });

    it('should return config for OpenAI models', () => {
      const config = getModelConfig('openai.gpt-oss-120b');
      expect(config.family).toBe('openai');
      expect(config.supportsTools).toBe(true);
    });

    it('should return config for Cohere models', () => {
      const config = getModelConfig('cohere.command-r-plus');
      expect(config.family).toBe('cohere');
      expect(config.supportsTools).toBe(true);
    });

    it('should return config for Cohere reasoning models', () => {
      const config = getModelConfig('cohere.command-a-reasoning');
      expect(config.usesReasoningTokens).toBe(true);
      expect(config.minTokens).toBe(100);
    });

    it('should return default config for unknown models', () => {
      const config = getModelConfig('unknown.mystery-model');
      expect(config.family).toBe('unknown');
      expect(config.minTokens).toBe(50);
      expect(config.supportsTools).toBe(true);
    });

    it('should infer family from model prefix for unknown specific models', () => {
      const config = getModelConfig('meta.new-future-model');
      expect(config.family).toBe('meta');
    });
  });

  describe('getRecommendedMaxTokens', () => {
    it('should return requested tokens if above minimum', () => {
      const tokens = getRecommendedMaxTokens(
        'meta.llama-4-maverick-17b-128e-instruct-fp8',
        200
      );
      expect(tokens).toBe(200);
    });

    it('should return minimum for reasoning models if requested is too low', () => {
      const tokens = getRecommendedMaxTokens('google.gemini-2.5-flash', 20);
      expect(tokens).toBe(100); // Gemini requires at least 100
    });

    it('should return minimum tokens if no value specified', () => {
      const llamaTokens = getRecommendedMaxTokens(
        'meta.llama-4-maverick-17b-128e-instruct-fp8'
      );
      expect(llamaTokens).toBe(50);

      const geminiTokens = getRecommendedMaxTokens('google.gemini-2.5-flash');
      expect(geminiTokens).toBe(100);
    });

    it('should not modify tokens for non-reasoning models', () => {
      const tokens = getRecommendedMaxTokens(
        'meta.llama-4-maverick-17b-128e-instruct-fp8',
        20
      );
      expect(tokens).toBe(20); // Llama doesn't require higher minimum
    });
  });

  describe('modelSupports', () => {
    it('should check tool support', () => {
      expect(
        modelSupports('meta.llama-4-maverick-17b-128e-instruct-fp8', 'tools')
      ).toBe(true);
      expect(modelSupports('google.gemini-2.5-flash', 'tools')).toBe(true);
    });

    it('should check streaming support', () => {
      expect(
        modelSupports(
          'meta.llama-4-maverick-17b-128e-instruct-fp8',
          'streaming'
        )
      ).toBe(true);
      expect(modelSupports('xai.grok-3', 'streaming')).toBe(true);
    });

    it('should check system message support', () => {
      expect(
        modelSupports(
          'meta.llama-4-maverick-17b-128e-instruct-fp8',
          'systemMessages'
        )
      ).toBe(true);
    });
  });

  describe('getKnownModelPrefixes', () => {
    it('should return list of known prefixes', () => {
      const prefixes = getKnownModelPrefixes();
      expect(prefixes).toContain('meta.llama');
      expect(prefixes).toContain('google.gemini');
      expect(prefixes).toContain('xai.grok');
      expect(prefixes).toContain('openai.gpt-oss');
      expect(prefixes).toContain('cohere.command');
    });
  });
});
