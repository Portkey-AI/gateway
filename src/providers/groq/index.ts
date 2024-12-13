import { ProviderConfigs } from '../types';
import GroqAPIConfig from './api';
import { GroqChatCompleteStreamChunkTransform } from './chatComplete';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { GROQ } from '../../globals';

const GroqConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(['logprobs', 'logits_bias', 'top_logprobs']),
  api: GroqAPIConfig,
  responseTransforms: {
    ...responseTransformers(GROQ, {
      chatComplete: true,
    }),
    'stream-chatComplete': GroqChatCompleteStreamChunkTransform,
  },
};

export default GroqConfig;
