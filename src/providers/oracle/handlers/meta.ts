/**
 * Meta (Llama) Model Handler
 *
 * Handles Meta's Llama family models on OCI GenAI.
 * Llama models have straightforward behavior with full feature support.
 */

import { BaseModelHandler, ModelHandlerConfig } from './base';

export class MetaHandler extends BaseModelHandler {
  constructor(modelId: string) {
    const config: ModelHandlerConfig = {
      modelId,
      family: 'meta',
      minTokens: 50,
      usesReasoningTokens: false,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
    };
    super(config);
  }
}
