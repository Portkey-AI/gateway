import { OPENZOO } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { OpenZooAPIConfig } from './api';

// See ./api.ts: the hosted endpoint needs an `ozk_live_` subscription key as
// the provider API key; `custom_host` can target a local `npx openzoo` proxy.
export const OpenZooProviderConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'auto' }),
  api: OpenZooAPIConfig,
  responseTransforms: responseTransformers(OPENZOO, {
    chatComplete: true,
  }),
};
