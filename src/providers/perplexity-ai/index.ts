import { ProviderConfigs } from '../types';
import PerplexityAIApiConfig from './api';
import {
  PerplexityAIChatCompleteConfig,
  PerplexityAIChatCompleteResponseTransform,
  PerplexityAIChatCompleteStreamChunkTransform,
} from './chatComplete';
import { PerplexityAiLogConfig } from './pricing';

const PerplexityAIConfig: ProviderConfigs = {
  chatComplete: PerplexityAIChatCompleteConfig,
  api: PerplexityAIApiConfig,
  responseTransforms: {
    chatComplete: PerplexityAIChatCompleteResponseTransform,
    'stream-chatComplete': PerplexityAIChatCompleteStreamChunkTransform,
  },
  pricing: PerplexityAiLogConfig,
};

export default PerplexityAIConfig;
