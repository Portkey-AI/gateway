import { ProviderConfigs } from '../types';
import { Z_AI } from '../../globals';
import ZAIAPIConfig from './api';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import {
  ZAIImageGenerateConfig,
  ZAIImageGenerateResponseTransform,
} from './imageGenerate';

const ZAIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'glm-4.6' }),
  imageGenerate: ZAIImageGenerateConfig,
  api: ZAIAPIConfig,
  responseTransforms: {
    ...responseTransformers(Z_AI, {
      chatComplete: true,
    }),
    imageGenerate: ZAIImageGenerateResponseTransform,
  },
};

export default ZAIConfig;
