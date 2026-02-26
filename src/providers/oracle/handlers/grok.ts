/**
 * xAI Grok Model Handler
 *
 * Handles xAI's Grok family models on OCI GenAI.
 * Grok reasoning variants use reasoning tokens.
 */

import { BaseModelHandler, ModelHandlerConfig } from './base';

export class GrokHandler extends BaseModelHandler {
  constructor(modelId: string) {
    // Check if it's a reasoning model
    const isReasoningModel = modelId.includes('-reasoning');

    const config: ModelHandlerConfig = {
      modelId,
      family: 'xai',
      minTokens: isReasoningModel ? 100 : 50,
      usesReasoningTokens: isReasoningModel,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
    };
    super(config);
  }
}
