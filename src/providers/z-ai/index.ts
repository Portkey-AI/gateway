import { ProviderConfigs } from '../types';
import { Z_AI } from '../../globals';
import ZAIAPIConfig from './api';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';

const ZAIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'glm-4.6' }),
  api: ZAIAPIConfig,
  responseTransforms: {
    ...responseTransformers(Z_AI, {
      chatComplete: true,
    }),
  },
};

export default ZAIConfig;
