import { CEREBRAS } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { cerebrasAPIConfig } from './api';

export const cerebrasProviderAPIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([]),
  api: cerebrasAPIConfig,
  responseTransforms: responseTransformers(CEREBRAS, {
    chatComplete: true,
  }),
};
