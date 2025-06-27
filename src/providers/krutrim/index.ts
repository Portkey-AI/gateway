import { ProviderConfigs } from '../types';
import KrutrimAPIConfig from './api';
import { chatCompleteParams } from '../open-ai-base';
import { KrutrimChatCompleteResponseTransform } from './chatComplete';
const KrutrimConfig: ProviderConfigs = {
  api: KrutrimAPIConfig,
  chatComplete: chatCompleteParams([
    'max_tokens',
    'temperature',
    'top_p',
    'frequency_penalty',
    'logit_bias',
    'logprobs',
    'presence_penalty',
    'seed',
    'top_k',
  ]),
  responseTransforms: {
    chatComplete: KrutrimChatCompleteResponseTransform,
  },
};

export default KrutrimConfig;
