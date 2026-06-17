import { ProviderConfigs } from '../types';
import EmpirioLabsAPIConfig from './api';
import { EmpirioLabsChatCompleteStreamChunkTransform } from './chatComplete';
import { EmpirioLabsEmbedConfig } from './embed';
import {
  chatCompleteParams,
  responseTransformers,
  createSpeechParams,
} from '../open-ai-base';
import {
  OpenAIImageGenerateConfig,
  OpenAIImageGenerateResponseTransform,
} from '../openai/imageGenerate';
import { OpenAICreateTranscriptionResponseTransform } from '../openai/createTranscription';
import { EMPIRIOLABS } from '../../globals';

const EmpirioLabsConfig: ProviderConfigs = {
  api: EmpirioLabsAPIConfig,
  chatComplete: chatCompleteParams([]),
  embed: EmpirioLabsEmbedConfig,
  imageGenerate: OpenAIImageGenerateConfig,
  createSpeech: createSpeechParams([]),
  createTranscription: {},
  responseTransforms: {
    ...responseTransformers(EMPIRIOLABS, {
      chatComplete: true,
      embed: true,
      createSpeech: true,
    }),
    imageGenerate: OpenAIImageGenerateResponseTransform,
    createTranscription: OpenAICreateTranscriptionResponseTransform,
    'stream-chatComplete': EmpirioLabsChatCompleteStreamChunkTransform,
  },
};

export default EmpirioLabsConfig;
