import { RUNCRATE } from '../../globals';
import {
  chatCompleteParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { runcrateAPIConfig } from './api';

export const RuncrateConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], {
    model: 'deepseek-ai/DeepSeek-V4.1-Flash',
  }),
  embed: embedParams([], { model: 'Qwen/Qwen3-Embedding-0.6B' }),
  api: runcrateAPIConfig,
  responseTransforms: responseTransformers(RUNCRATE, {
    chatComplete: true,
    embed: true,
  }),
};
