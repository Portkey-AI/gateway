import { SALADCLOUD } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import SaladCloudAPIConfig from './api';

const SaladCloudConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    [
      'audio',
      'logit_bias',
      'logprobs',
      'metadata',
      'modalities',
      'parallel_tool_calls',
      'prediction',
      'prompt_cache_key',
      'reasoning_effort',
      'safety_identifier',
      'service_tier',
      'store',
      'top_logprobs',
      'verbosity',
      'web_search_options',
    ],
    { model: 'qwen3.6-35b-a3b' },
    {
      chat_template_kwargs: {
        param: 'chat_template_kwargs',
        required: true,
        default: { enable_thinking: false },
      },
    }
  ),
  api: SaladCloudAPIConfig,
  responseTransforms: responseTransformers(SALADCLOUD, {
    chatComplete: true,
  }),
};

export default SaladCloudConfig;
