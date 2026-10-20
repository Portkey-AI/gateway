import { HOPPER } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { HopperAPIConfig } from './api';

const HopperConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], undefined, {
    model: { param: 'model', required: true },
  }),
  api: HopperAPIConfig,
  responseTransforms: responseTransformers(HOPPER, {
    chatComplete: true,
  }),
};

export default HopperConfig;
