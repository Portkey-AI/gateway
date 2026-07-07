import { GONKAROUTER } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { GonkaRouterAPIConfig } from './api';

export const GonkaRouterProviderConfig: ProviderConfigs = {
  // Pure pass-through: do not bake in a default model. Clear the inherited
  // OpenAI base default ('gpt-3.5-turbo') so an omitted model surfaces a clean
  // "model required" error from GonkaRouter instead of routing to a phantom model.
  chatComplete: chatCompleteParams([], { model: undefined }),
  complete: completeParams([]),
  api: GonkaRouterAPIConfig,
  responseTransforms: responseTransformers(GONKAROUTER, {
    chatComplete: true,
    complete: true,
  }),
};
