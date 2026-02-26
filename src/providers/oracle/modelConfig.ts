/**
 * Oracle GenAI Model Configuration
 *
 * Handles model-specific behaviors and requirements for different model families
 * on OCI GenAI. Each model family may have different:
 * - Minimum token requirements (e.g., Gemini uses reasoning tokens)
 * - Tool calling support
 * - Streaming behavior
 * - Response format quirks
 */

export interface OracleModelConfig {
  // Model family identifier
  family: 'meta' | 'google' | 'openai' | 'xai' | 'cohere' | 'unknown';

  // Minimum tokens needed for a response (some models use reasoning tokens internally)
  minTokens: number;

  // Whether the model supports tool/function calling
  supportsTools: boolean;

  // Whether the model supports streaming
  supportsStreaming: boolean;

  // Whether the model supports system messages
  supportsSystemMessages: boolean;

  // Whether the model uses reasoning tokens (reduces output tokens)
  usesReasoningTokens: boolean;

  // Model-specific notes for debugging
  notes?: string;
}

// Default configuration for unknown models
const DEFAULT_CONFIG: OracleModelConfig = {
  family: 'unknown',
  minTokens: 50,
  supportsTools: true,
  supportsStreaming: true,
  supportsSystemMessages: true,
  usesReasoningTokens: false,
};

// Model family configurations
const MODEL_CONFIGS: Record<string, Partial<OracleModelConfig>> = {
  // Meta Llama models - straightforward, full feature support
  'meta.llama': {
    family: 'meta',
    minTokens: 50,
    supportsTools: true,
    supportsStreaming: true,
    supportsSystemMessages: true,
    usesReasoningTokens: false,
  },

  // Google Gemini models - use reasoning tokens internally
  'google.gemini': {
    family: 'google',
    minTokens: 100, // Higher due to reasoning token overhead
    supportsTools: true,
    supportsStreaming: true,
    supportsSystemMessages: true,
    usesReasoningTokens: true,
    notes:
      'Gemini models consume reasoning tokens internally, requiring higher max_tokens',
  },

  // xAI Grok models
  'xai.grok': {
    family: 'xai',
    minTokens: 50,
    supportsTools: true,
    supportsStreaming: true,
    supportsSystemMessages: true,
    usesReasoningTokens: false,
  },

  // Grok reasoning models - use reasoning tokens
  'xai.grok-4-1-fast-reasoning': {
    family: 'xai',
    minTokens: 100,
    supportsTools: true,
    supportsStreaming: true,
    supportsSystemMessages: true,
    usesReasoningTokens: true,
    notes: 'Reasoning variant uses reasoning tokens',
  },

  'xai.grok-4-fast-reasoning': {
    family: 'xai',
    minTokens: 100,
    supportsTools: true,
    supportsStreaming: true,
    supportsSystemMessages: true,
    usesReasoningTokens: true,
    notes: 'Reasoning variant uses reasoning tokens',
  },

  // OpenAI OSS models on OCI - all variants use reasoning tokens
  'openai.gpt-oss': {
    family: 'openai',
    minTokens: 200, // Higher due to reasoning token overhead
    supportsTools: true,
    supportsStreaming: true,
    supportsSystemMessages: true,
    usesReasoningTokens: true,
    notes: 'GPT-OSS models use reasoningContent, requiring higher max_tokens',
  },

  // Cohere Command models
  'cohere.command': {
    family: 'cohere',
    minTokens: 50,
    supportsTools: true,
    supportsStreaming: true,
    supportsSystemMessages: true,
    usesReasoningTokens: false,
  },

  // Cohere Command-A reasoning models
  'cohere.command-a-reasoning': {
    family: 'cohere',
    minTokens: 100,
    supportsTools: true,
    supportsStreaming: true,
    supportsSystemMessages: true,
    usesReasoningTokens: true,
    notes: 'Reasoning variant uses reasoning tokens',
  },
};

/**
 * Get configuration for a specific model
 * @param modelId The model identifier (e.g., 'meta.llama-4-maverick-17b-128e-instruct-fp8')
 */
export function getModelConfig(modelId: string): OracleModelConfig {
  // Try exact match first
  if (MODEL_CONFIGS[modelId]) {
    return { ...DEFAULT_CONFIG, ...MODEL_CONFIGS[modelId] };
  }

  // Try prefix match (e.g., 'meta.llama' matches 'meta.llama-4-maverick...')
  for (const prefix of Object.keys(MODEL_CONFIGS)) {
    if (modelId.startsWith(prefix)) {
      return { ...DEFAULT_CONFIG, ...MODEL_CONFIGS[prefix] };
    }
  }

  // Infer family from model ID
  const family = inferModelFamily(modelId);
  return { ...DEFAULT_CONFIG, family };
}

/**
 * Infer model family from model ID
 */
function inferModelFamily(
  modelId: string
): 'meta' | 'google' | 'openai' | 'xai' | 'cohere' | 'unknown' {
  if (modelId.startsWith('meta.')) return 'meta';
  if (modelId.startsWith('google.')) return 'google';
  if (modelId.startsWith('openai.')) return 'openai';
  if (modelId.startsWith('xai.')) return 'xai';
  if (modelId.startsWith('cohere.')) return 'cohere';
  return 'unknown';
}

/**
 * Get recommended max_tokens for a model based on its configuration
 * @param modelId The model identifier
 * @param requestedTokens The user-requested max_tokens
 */
export function getRecommendedMaxTokens(
  modelId: string,
  requestedTokens?: number
): number {
  const config = getModelConfig(modelId);

  if (requestedTokens !== undefined) {
    // Ensure requested tokens meet minimum for reasoning models
    if (config.usesReasoningTokens && requestedTokens < config.minTokens) {
      return config.minTokens;
    }
    return requestedTokens;
  }

  // Default to minimum required tokens
  return config.minTokens;
}

/**
 * Check if a model supports a specific feature
 */
export function modelSupports(
  modelId: string,
  feature: 'tools' | 'streaming' | 'systemMessages'
): boolean {
  const config = getModelConfig(modelId);
  switch (feature) {
    case 'tools':
      return config.supportsTools;
    case 'streaming':
      return config.supportsStreaming;
    case 'systemMessages':
      return config.supportsSystemMessages;
    default:
      return true;
  }
}

/**
 * Get list of all known model prefixes for validation
 */
export function getKnownModelPrefixes(): string[] {
  return Object.keys(MODEL_CONFIGS);
}
