/**
 * Base Model Handler for Oracle GenAI
 *
 * This provides the base implementation for model-specific handling.
 * Each model family can extend this to customize behavior.
 */

import { Params } from '../../../types/requestBody';
import { ChatCompletionResponse } from '../../types';
import {
  OracleChatCompleteResponse,
  OracleStreamChunk,
} from '../types/GenericChatResponse';

export interface ModelHandlerConfig {
  modelId: string;
  family: string;
  minTokens: number;
  usesReasoningTokens: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsSystemMessages: boolean;
}

export interface StreamState {
  currentToolCallIndex: number;
  seenToolCallIds: Set<string>;
  finishReason?: string;
}

/**
 * Base handler providing default implementations
 */
export abstract class BaseModelHandler {
  protected config: ModelHandlerConfig;

  constructor(config: ModelHandlerConfig) {
    this.config = config;
  }

  /**
   * Get recommended max_tokens for this model
   */
  getRecommendedMaxTokens(requested?: number): number {
    if (requested === undefined) {
      return this.config.minTokens;
    }

    if (this.config.usesReasoningTokens && requested < this.config.minTokens) {
      return this.config.minTokens;
    }

    return requested;
  }

  /**
   * Transform request parameters for this model
   * Override in subclasses for model-specific transformations
   */
  transformRequestParams(params: Params): Params {
    return {
      ...params,
      max_tokens: this.getRecommendedMaxTokens(params.max_tokens),
    };
  }

  /**
   * Check if a specific feature is supported
   */
  supports(feature: 'tools' | 'streaming' | 'systemMessages'): boolean {
    switch (feature) {
      case 'tools':
        return this.config.supportsTools;
      case 'streaming':
        return this.config.supportsStreaming;
      case 'systemMessages':
        return this.config.supportsSystemMessages;
      default:
        return true;
    }
  }

  /**
   * Post-process the response
   * Override in subclasses for model-specific response handling
   */
  postProcessResponse(
    response: OracleChatCompleteResponse
  ): OracleChatCompleteResponse {
    return response;
  }

  /**
   * Post-process streaming chunk
   * Override in subclasses for model-specific streaming handling
   */
  postProcessStreamChunk(
    chunk: OracleStreamChunk,
    state: StreamState
  ): OracleStreamChunk {
    return chunk;
  }

  /**
   * Initialize stream state
   */
  initStreamState(): StreamState {
    return {
      currentToolCallIndex: -1,
      seenToolCallIds: new Set(),
    };
  }

  /**
   * Check if response needs role defaulting
   * Some models (like Gemini) don't always return role in responses
   */
  needsRoleDefault(): boolean {
    return false;
  }
}

/**
 * Factory function to create the appropriate handler for a model
 */
export function getModelHandler(modelId: string): BaseModelHandler {
  // Import handlers dynamically to avoid circular dependencies
  const { MetaHandler } = require('./meta');
  const { GeminiHandler } = require('./gemini');
  const { GrokHandler } = require('./grok');
  const { OpenAIHandler } = require('./openai');
  const { CohereHandler } = require('./cohere');
  const { DefaultHandler } = require('./default');

  if (modelId.startsWith('meta.')) {
    return new MetaHandler(modelId);
  }
  if (modelId.startsWith('google.')) {
    return new GeminiHandler(modelId);
  }
  if (modelId.startsWith('xai.')) {
    return new GrokHandler(modelId);
  }
  if (modelId.startsWith('openai.')) {
    return new OpenAIHandler(modelId);
  }
  if (modelId.startsWith('cohere.')) {
    return new CohereHandler(modelId);
  }

  return new DefaultHandler(modelId);
}
