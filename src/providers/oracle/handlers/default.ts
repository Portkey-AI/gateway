/**
 * Default Model Handler
 *
 * Fallback handler for unknown models on OCI GenAI.
 * Uses conservative defaults that should work with most models.
 */

import { BaseModelHandler, ModelHandlerConfig } from './base';

export class DefaultHandler extends BaseModelHandler {
  constructor(modelId: string) {
    // Infer family from model ID prefix if possible
    let family = 'unknown';
    if (modelId.includes('.')) {
      const prefix = modelId.split('.')[0];
      if (['meta', 'google', 'openai', 'xai', 'cohere'].includes(prefix)) {
        family = prefix;
      }
    }

    const config: ModelHandlerConfig = {
      modelId,
      family,
      minTokens: 50,
      usesReasoningTokens: false,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
    };
    super(config);
  }

  /**
   * Unknown models may have varying role behavior
   */
  needsRoleDefault(): boolean {
    return true;
  }
}
