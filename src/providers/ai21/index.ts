import { chatCompleteParams } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import AI21APIConfig from './api';
import {
  AI21ChatCompleteResponseTransform,
  AI21ChatCompleteStreamChunkTransform,
} from './chatComplete';
import { AI21CompleteConfig, AI21CompleteResponseTransform } from './complete';
import { AI21EmbedConfig, AI21EmbedResponseTransform } from './embed';

// Not part of the Jamba chat request body. See
// https://docs.ai21.com/reference/jamba-1-6-api-ref
const UNSUPPORTED_CHAT_PARAMS = [
  'functions',
  'function_call',
  'presence_penalty',
  'frequency_penalty',
  'logit_bias',
  'user',
  'seed',
  'logprobs',
  'top_logprobs',
  'stream_options',
  'service_tier',
  'parallel_tool_calls',
  'store',
  'metadata',
  'modalities',
  'audio',
  'prediction',
  'reasoning_effort',
  'web_search_options',
  'prompt_cache_key',
  'safety_identifier',
  'verbosity',
];

const AI21Config: ProviderConfigs = {
  complete: AI21CompleteConfig,
  chatComplete: chatCompleteParams(
    UNSUPPORTED_CHAT_PARAMS,
    { model: 'jamba-large' },
    {
      // Jamba only accepts max_tokens. Map the newer OpenAI field onto it.
      max_completion_tokens: {
        param: 'max_tokens',
        min: 0,
      },
      documents: {
        param: 'documents',
      },
    }
  ),
  embed: AI21EmbedConfig,
  api: AI21APIConfig,
  responseTransforms: {
    complete: AI21CompleteResponseTransform,
    chatComplete: AI21ChatCompleteResponseTransform,
    'stream-chatComplete': AI21ChatCompleteStreamChunkTransform,
    embed: AI21EmbedResponseTransform,
  },
};

export default AI21Config;
