import { FEATHERLESS_AI } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { featherlessAIAPIConfig } from './api';

export const FeatherlessAIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], {
    model: 'mistralai/Magistral-Small-2506',
  }),
  complete: completeParams([], { model: 'mistralai/Magistral-Small-2506' }),
  api: featherlessAIAPIConfig,
  responseTransforms: responseTransformers(FEATHERLESS_AI, {
    chatComplete: true,
    complete: true,
  }),
};
