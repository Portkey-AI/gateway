import { ProviderConfigs } from '../types';
import FireworksAIAPIConfig from './api';
import {
  FireworksAIChatCompleteConfig,
  FireworksAIChatCompleteResponseTransform,
  FireworksAIChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  FireworksAICompleteConfig,
  FireworksAICompleteResponseTransform,
  FireworksAICompleteStreamChunkTransform,
} from './complete';
import {
  FireworksAIEmbedConfig,
  FireworksAIEmbedResponseTransform,
} from './embed';
import {
  FireworksAIImageGenerateConfig,
  FireworksAIImageGenerateResponseTransform,
} from './imageGenerate';
import { FireworksFileListResponseTransform } from './listFiles';
import { FireworksFileRetrieveResponseTransform } from './retrieveFile';

const FireworksAIConfig: ProviderConfigs = {
  complete: FireworksAICompleteConfig,
  chatComplete: FireworksAIChatCompleteConfig,
  embed: FireworksAIEmbedConfig,
  imageGenerate: FireworksAIImageGenerateConfig,
  api: FireworksAIAPIConfig,
  responseTransforms: {
    complete: FireworksAICompleteResponseTransform,
    'stream-complete': FireworksAICompleteStreamChunkTransform,
    chatComplete: FireworksAIChatCompleteResponseTransform,
    'stream-chatComplete': FireworksAIChatCompleteStreamChunkTransform,
    embed: FireworksAIEmbedResponseTransform,
    imageGenerate: FireworksAIImageGenerateResponseTransform,
    listFiles: FireworksFileListResponseTransform,
    retrieveFile: FireworksFileRetrieveResponseTransform,
  },
};

export default FireworksAIConfig;
