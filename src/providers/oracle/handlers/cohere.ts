/**
 * Cohere Model Handler
 *
 * Handles Cohere's Command family models on OCI GenAI.
 * Cohere reasoning models use reasoning tokens.
 */

import { BaseModelHandler, ModelHandlerConfig } from './base';

export class CohereHandler extends BaseModelHandler {
  constructor(modelId: string) {
    // Check if it's a reasoning model
    const isReasoningModel = modelId.includes('-reasoning');

    const config: ModelHandlerConfig = {
      modelId,
      family: 'cohere',
      minTokens: isReasoningModel ? 100 : 50,
      usesReasoningTokens: isReasoningModel,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
    };
    super(config);
  }
}
