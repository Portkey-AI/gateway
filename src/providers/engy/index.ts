import { ENGY } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { EngyAPIConfig } from './api';

export const EngyProviderConfig: ProviderConfigs = {
  // Pure pass-through: do not bake in a default model. Clear the inherited
  // OpenAI base default ('gpt-3.5-turbo') so an omitted model surfaces a clean
  // "model required" error from Engy instead of routing to a phantom model.
  chatComplete: chatCompleteParams([], { model: undefined }),
  api: EngyAPIConfig,
  responseTransforms: responseTransformers(ENGY, {
    chatComplete: true,
  }),
};
