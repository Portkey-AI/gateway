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
  chatComplete: chatCompleteParams([], {
    model: 'Qwen/Qwen2.5-72B-Instruct-fast',
  }),
  embed: embedParams([], { model: 'BAAI/bge-en-icl' }),
  complete: completeParams([], { model: 'Qwen/Qwen2.5-72B-Instruct-fast' }),
  api: nebiusAPIConfig,
  responseTransforms: responseTransformers(NEBIUS, {
    chatComplete: true,
    embed: true,
    complete: true,
  }),
};

export default NebiusConfig;
