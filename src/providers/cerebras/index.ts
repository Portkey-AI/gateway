import { CEREBRAS } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { cerebrasAPIConfig } from './api';

export const cerebrasProviderAPIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([
    'frequency_penalty',
    'logit_bias',
    'logprobs',
    'presence_penalty',
    'parallel_tool_calls',
    'service_tier',
  ]),
  complete: completeParams([
    'frequency_penalty',
    'logit_bias',
    'logprobs',
    'presence_penalty',
    'best_of',
    'echo',
  ]),
  api: cerebrasAPIConfig,
  responseTransforms: responseTransformers(CEREBRAS, {
    chatComplete: true,
    complete: true,
  }),
};
