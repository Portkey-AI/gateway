import { CROWLLM } from '../../globals';
import { responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import CrowLLMAPIConfig from './api';
import {
  CrowLLMChatCompleteConfig,
  CrowLLMChatCompleteStreamChunkTransform,
} from './chatComplete';

const CrowLLMConfig: ProviderConfigs = {
  api: CrowLLMAPIConfig,
  chatComplete: CrowLLMChatCompleteConfig,
  responseTransforms: {
    ...responseTransformers(CROWLLM, {
      chatComplete: true,
    }),
    'stream-chatComplete': CrowLLMChatCompleteStreamChunkTransform,
  },
};

export default CrowLLMConfig;
