import { CRUSOE } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { CrusoeAPIConfig } from './api';

export const CrusoeProviderConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], {
    model: 'meta-llama/Llama-3.3-70B-Instruct',
  }),
  complete: completeParams([], {
    model: 'meta-llama/Llama-3.3-70B-Instruct',
  }),
  api: CrusoeAPIConfig,
  responseTransforms: responseTransformers(CRUSOE, {
    chatComplete: true,
    complete: true,
  }),
};
