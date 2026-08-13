import { NEBIUS } from '../../globals';
import {
  chatCompleteParams,
  embedParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { nebiusAPIConfig } from './api';

const NebiusConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], undefined, {
    model: {
      param: 'model',
      required: true,
    },
  }),
  embed: embedParams([]),
  complete: completeParams([]),
  api: nebiusAPIConfig,
  responseTransforms: responseTransformers(NEBIUS, {
    chatComplete: true,
    embed: true,
    complete: true,
  }),
};

export default NebiusConfig;
