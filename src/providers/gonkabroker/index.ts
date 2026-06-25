import { GONKABROKER } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { GonkaBrokerAPIConfig } from './api';

export const GonkaBrokerProviderConfig: ProviderConfigs = {
  // Pure pass-through: do not bake in a default model. Clear the inherited
  // OpenAI base default ('gpt-3.5-turbo') so an omitted model surfaces a clean
  // "model required" error from the broker instead of routing to a phantom model.
  chatComplete: chatCompleteParams([], { model: undefined }),
  complete: completeParams([]),
  api: GonkaBrokerAPIConfig,
  responseTransforms: responseTransformers(GONKABROKER, {
    chatComplete: true,
    complete: true,
  }),
};
