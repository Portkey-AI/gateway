import { ProviderConfigs } from '../types';
import GroqAPIConfig from './api';
import { GroqChatCompleteStreamChunkTransform } from './chatComplete';
import {
  chatCompleteParams,
  responseTransformers,
  createSpeechParams,
  createModelResponseParams,
} from '../open-ai-base';
import { GROQ } from '../../globals';
import { GroqLogConfig } from './pricing';

const GroqConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    ['logprobs', 'logits_bias', 'top_logprobs'],
    undefined,
    {
      service_tier: { param: 'service_tier', required: false },
      reasoning_effort: { param: 'reasoning_effort', required: false },
    }
  ),
  createModelResponse: createModelResponseParams([]),
  api: GroqAPIConfig,
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
  pricing: GroqLogConfig,
};

export default GroqConfig;
