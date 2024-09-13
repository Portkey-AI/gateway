import { UPSTAGE } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { upstageAPIConfig } from './api';

export const UpstageProviderConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'solar-pro' }),
  api: upstageAPIConfig,
  responseTransforms: responseTransformers(UPSTAGE, {
    chatComplete: true,
  }),
};
