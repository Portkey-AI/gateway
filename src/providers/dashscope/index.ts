import { DASHSCOPE } from '../../globals';
import {
  chatCompleteParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { dashscopeAPIConfig } from './api';

export const DashScopeConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    [],
    { model: 'qwen-turbo' },
    {
      top_k: {
        param: 'top_k',
      },
      repetition_penalty: {
        param: 'repetition_penalty',
      },
      stop: {
        param: 'stop',
      },
      enable_search: {
        param: 'enable_search',
      },
      enable_thinking: {
        param: 'enable_thinking',
      },
      thinking_budget: {
        param: 'thinking_budget',
      },
    }
  ),
  embed: embedParams([], { model: 'text-embedding-v1' }),
  api: dashscopeAPIConfig,
  responseTransforms: responseTransformers(DASHSCOPE, {
    chatComplete: true,
    embed: true,
  }),
};
