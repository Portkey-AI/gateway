import { MIXLAYER } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { mixlayerAPIConfig } from './api';

export const mixlayerProviderAPIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([
    'n',
    'logit_bias',
    'logprobs',
    'top_logprobs',
    'user',
  ]),
  api: mixlayerAPIConfig,
  responseTransforms: responseTransformers(MIXLAYER, {
    chatComplete: true,
  }),
};
