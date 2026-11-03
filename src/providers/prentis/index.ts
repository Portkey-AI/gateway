import { PRENTIS } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import PrentisAPIConfig from './api';

const PrentisConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(['n', 'logprobs', 'top_logprobs'], {
    model: 'deepseek-v4.1-flash',
  }),
  complete: completeParams(['n', 'logprobs', 'best_of', 'echo', 'suffix'], {
    model: 'deepseek-v4.1-flash',
  }),
  api: PrentisAPIConfig,
  responseTransforms: responseTransformers(PRENTIS, {
    chatComplete: true,
    complete: true,
  }),
};

export default PrentisConfig;
