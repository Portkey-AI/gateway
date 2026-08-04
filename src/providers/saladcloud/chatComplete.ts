import { ProviderConfig } from '../types';

export const SaladCloudChatCompleteExcludedParams = [
  'audio',
  'logit_bias',
  'logprobs',
  'metadata',
  'modalities',
  'parallel_tool_calls',
  'prediction',
  'prompt_cache_key',
  'safety_identifier',
  'service_tier',
  'store',
  'top_logprobs',
  'verbosity',
  'web_search_options',
];

export const SaladCloudChatCompleteDefaults = {
  model: 'qwen3.6-35b-a3b',
};

export const SaladCloudChatCompleteExtraParams: ProviderConfig = {
  top_k: {
    param: 'top_k',
  },
  chat_template_kwargs: {
    param: 'chat_template_kwargs',
  },
};
