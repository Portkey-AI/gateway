import { WALLY } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { wallyAPIConfig } from './api';

export const WallyConfig: ProviderConfigs = {
  // Own model config so the default does not mutate the shared OpenAI one.
  chatComplete: chatCompleteParams([], undefined, {
    model: {
      param: 'model',
      required: true,
      default: 'deepseek-v4.1-flash',
    },
  }),
  api: wallyAPIConfig,
  responseTransforms: responseTransformers(WALLY, {
    chatComplete: true,
  }),
};
