import { CEREBRAS } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { cerebrasAPIConfig } from './api';

export const cerebrasProviderAPIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'presence_penalty',
      'parallel_tool_calls',
      'service_tier',
    ],
    undefined,
    {
      max_completion_tokens: {
        param: 'max_tokens',
        default: 100,
        min: 0,
      },
    }
  ),
  api: cerebrasAPIConfig,
  responseTransforms: responseTransformers(CEREBRAS, {
    chatComplete: true,
  }),
};
