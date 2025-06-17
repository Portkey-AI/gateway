import { ProviderConfigs } from '../types';
import GroqAPIConfig from './api';
import { GroqChatCompleteStreamChunkTransform } from './chatComplete';
import {
  chatCompleteParams,
  responseTransformers,
  createSpeechParams,
} from '../open-ai-base';
import { GROQ } from '../../globals';

const GroqConfig: ProviderConfigs = {
  api: GroqAPIConfig,
  chatComplete: chatCompleteParams(
    ['logprobs', 'logits_bias', 'top_logprobs'],
    undefined,
    { service_tier: { param: 'service_tier', required: false } }
  ),
  createTranscription: {},
  createTranslation: {},
  createSpeech: createSpeechParams([]),
  responseTransforms: {
    ...responseTransformers(GROQ, {
      chatComplete: true,
      createSpeech: true,
    }),
    'stream-chatComplete': GroqChatCompleteStreamChunkTransform,
  },
};

export default GroqConfig;
