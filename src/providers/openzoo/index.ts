import { OPENZOO } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { OpenZooAPIConfig } from './api';

export const OpenZooProviderConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'z-ai/glm-5.3-flash' }),
  api: OpenZooAPIConfig,
  responseTransforms: responseTransformers(OPENZOO, {
    chatComplete: true,
  }),
};
