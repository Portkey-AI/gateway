import { ProviderConfig } from '../types';
import { chatCompleteParams } from '../open-ai-base';

// Valar rejects the parameters below rather than ignoring them, so they are
// dropped here instead of being forwarded from an OpenAI-shaped request.
// See https://docs.valarhq.ai/support for the full matrix.
const UNSUPPORTED_PARAMS = [
  'functions',
  'function_call',
  'stop',
  'presence_penalty',
  'frequency_penalty',
  'logit_bias',
  'seed',
  'logprobs',
  'top_logprobs',
  'audio',
  'prediction',
  'web_search_options',
  'service_tier',
  'verbosity',
  'safety_identifier',
  'prompt_cache_key',
  // Responses are always stored; `store: false` is rejected.
  'store',
];

export const ValarChatCompleteConfig: ProviderConfig = {
  ...chatCompleteParams(UNSUPPORTED_PARAMS),
  model: {
    param: 'model',
    required: true,
  },
  // `max_tokens` is rejected as a deprecated field, so an OpenAI client that
  // still sends it is mapped onto its modern replacement. When a request
  // carries both, `max_completion_tokens` is applied last and wins.
  max_tokens: {
    param: 'max_completion_tokens',
    min: 0,
  },
  max_completion_tokens: {
    param: 'max_completion_tokens',
    min: 0,
  },
  // A response always carries exactly one choice.
  n: {
    param: 'n',
    default: 1,
    max: 1,
  },
};
