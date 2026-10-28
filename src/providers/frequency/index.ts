import { FREQUENCY } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import FrequencyAPIConfig from './api';

const FrequencyConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    [
      'n',
      'logprobs',
      'top_logprobs',
      'logit_bias',
      'parallel_tool_calls',
      'user',
    ],
    { model: 'google/gemma-4-26b-a4b-it' },
    {
      top_k: { param: 'top_k' },
      min_p: { param: 'min_p' },
      repetition_penalty: { param: 'repetition_penalty' },
    }
  ),
  api: FrequencyAPIConfig,
  responseTransforms: responseTransformers(FREQUENCY, {
    chatComplete: true,
  }),
};

export default FrequencyConfig;
