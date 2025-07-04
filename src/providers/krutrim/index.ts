import { ProviderConfigs } from '../types';
import KrutrimAPIConfig from './api';
import { chatCompleteParams } from '../open-ai-base';
import { KrutrimChatCompleteResponseTransform } from './chatComplete';
const KrutrimConfig: ProviderConfigs = {
  api: KrutrimAPIConfig,
  chatComplete: chatCompleteParams([], { model: 'Llama-3.3-70B-Instruct' }),
  responseTransforms: {
    chatComplete: KrutrimChatCompleteResponseTransform,
  },
};

export default KrutrimConfig;
