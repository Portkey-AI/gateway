import { ProviderConfigs } from '../types';
import MartLLMAPIConfig from './api';
import { MartLLMChatCompleteStreamChunkTransform } from './chatComplete';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { MARTLLM } from '../../globals';

const MartLLMConfig: ProviderConfigs = {
  api: MartLLMAPIConfig,
  chatComplete: chatCompleteParams([], {
    model: 'deepseek/deepseek-v4.1-flash',
  }),
  responseTransforms: {
    ...responseTransformers(MARTLLM, {
      chatComplete: true,
    }),
    'stream-chatComplete': MartLLMChatCompleteStreamChunkTransform,
  },
};

export default MartLLMConfig;
