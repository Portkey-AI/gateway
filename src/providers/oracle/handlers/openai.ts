/**
 * OpenAI OSS Model Handler
 *
 * Handles OpenAI OSS models on OCI GenAI.
 * These are open source models with OpenAI-compatible behavior.
 */

import { BaseModelHandler, ModelHandlerConfig, StreamState } from './base';
import { OracleStreamChunk } from '../types/GenericChatResponse';

export class OpenAIHandler extends BaseModelHandler {
  constructor(modelId: string) {
    const config: ModelHandlerConfig = {
      modelId,
      family: 'openai',
      minTokens: 50,
      usesReasoningTokens: false,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
    };
    super(config);
  }

  /**
   * OpenAI OSS models may have different streaming content format
   */
  postProcessStreamChunk(
    chunk: OracleStreamChunk,
    state: StreamState
  ): OracleStreamChunk {
    // Ensure content array exists for streaming
    if (chunk.message && !chunk.message.content) {
      chunk.message.content = [];
    }
    return chunk;
  }
}
