import { ProviderConfigs } from '../types';
import LemonfoxAIAPIConfig from './api';
import {
  LemonfoxAIChatCompleteConfig,
  LemonfoxAIChatCompleteResponseTransform,
  LemonfoxAIChatCompleteStreamChunkTransform
} from './chatComplete'
import {
  LemonfoxAIImageGenerateConfig,
  LemonfoxImageGenerateResponseTransform,

} from './imageGenerate'

import {
  LemonfoxAICreateTranscriptionResponseTransform,
  LemonfoxAIcreateTranscriptionConfig
} from './createTranscription'

const LemonfoxAIConfig: ProviderConfigs = {
  chatComplete: LemonfoxAIChatCompleteConfig,
  imageGenerate: LemonfoxAIImageGenerateConfig,
  createTranscription: LemonfoxAIcreateTranscriptionConfig,
  api: LemonfoxAIAPIConfig,
  responseTransforms: {
    chatComplete: LemonfoxAIChatCompleteResponseTransform,
    'stream-chatComplete': LemonfoxAIChatCompleteStreamChunkTransform,
    imageGenerate: LemonfoxImageGenerateResponseTransform,
    'createTranscription': LemonfoxAICreateTranscriptionResponseTransform
  },
};
  
export default LemonfoxAIConfig;
  