import { AI21 } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import AI21APIConfig from './api';
import { AI21CompleteConfig, AI21CompleteResponseTransform } from './complete';
import { AI21EmbedConfig, AI21EmbedResponseTransform } from './embed';

/**
 * AI21 Studio provider configuration.
 *
 * Chat completions use the Jamba model family via the OpenAI-compatible
 * /v1/chat/completions endpoint (introduced with Jamba 1.5 and later).
 * Reference: https://docs.ai21.com/reference/jamba-1-6-api-ref
 *
 * Legacy Jurassic-2 text completions continue to use the model-specific
 * endpoint: /v1/{model}/complete
 */
const AI21Config: ProviderConfigs = {
  // Legacy Jurassic-2 text completion (unchanged)
  complete: AI21CompleteConfig,

  // Jamba chat completions via OpenAI-compatible /v1/chat/completions endpoint.
  // Excludes OpenAI params not supported by AI21 Jamba.
  chatComplete: chatCompleteParams([
    'logit_bias',
    'logprobs',
    'top_logprobs',
    'service_tier',
    'parallel_tool_calls',
  ]),

  embed: AI21EmbedConfig,
  api: AI21APIConfig,
  responseTransforms: {
    // Spread the OpenAI-compatible transformers (sets chatComplete).
    // Then override complete and embed with AI21-specific transforms.
    ...responseTransformers(AI21, { chatComplete: true }),
    complete: AI21CompleteResponseTransform,
    embed: AI21EmbedResponseTransform,
  },
};

export default AI21Config;
