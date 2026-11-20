import { ProviderConfigs } from '../types';
import { LLMTR } from '../../globals';
import LlmtrAPIConfig from './api';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';

const LlmtrConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'minimax/minimax-m3.1-flash' }),
  api: LlmtrAPIConfig,
  responseTransforms: {
    ...responseTransformers(LLMTR, {
      chatComplete: true,
    }),
  },
};

export default LlmtrConfig;
