import { DASHSCOPE } from '../../globals';
import {
  chatCompleteParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { dashscopeAPIConfig } from './api';

export const DashScopeConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'qwen-turbo' }),
  embed: embedParams([], { model: 'text-embedding-v1' }),
  api: dashscopeAPIConfig,
  responseTransforms: responseTransformers(DASHSCOPE, {
    chatComplete: true,
    embed: true,
  }),
};
