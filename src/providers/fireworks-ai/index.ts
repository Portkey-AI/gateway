import { ProviderConfigs } from '../types';
import FireworksAIAPIConfig from './api';
import {
  FireworkCancelFinetuneResponseTransform,
  FireworksCancelFinetuneRequestHandler,
} from './cancelFinetune';
import { FireworksAIChatCompleteConfig } from './chatComplete';
import {
  FireworksAICompleteConfig,
  FireworksAICompleteResponseTransform,
  FireworksAICompleteStreamChunkTransform,
} from './complete';
import {
  FireworkFinetuneTransform,
  FireworksFinetuneCreateConfig,
  FireworksRequestTransform,
} from './createFinetune';
import { FireworksAIEmbedConfig } from './embed';
import {
  FireworksAIImageGenerateConfig,
  FireworksAIImageGenerateResponseTransform,
} from './imageGenerate';
import { FireworksFileListResponseTransform } from './listFiles';
import { FireworkListFinetuneResponseTransform } from './listFinetune';
import { FireworksFileRetrieveResponseTransform } from './retrieveFile';
import { FireworkFileUploadRequestHandler } from './uploadFile';

const FireworksAIConfig: ProviderConfigs = {
  complete: FireworksAICompleteConfig,
  chatComplete: FireworksAIChatCompleteConfig,
  embed: FireworksAIEmbedConfig,
  imageGenerate: FireworksAIImageGenerateConfig,
  createFinetune: FireworksFinetuneCreateConfig,
  api: FireworksAIAPIConfig,
  responseTransforms: {
    complete: FireworksAICompleteResponseTransform,
    'stream-complete': FireworksAICompleteStreamChunkTransform,
    imageGenerate: FireworksAIImageGenerateResponseTransform,
    listFiles: FireworksFileListResponseTransform,
    retrieveFile: FireworksFileRetrieveResponseTransform,
    listFinetunes: FireworkListFinetuneResponseTransform,
    retrieveFinetune: FireworkFinetuneTransform,
    createFinetune: FireworkFinetuneTransform,
    cancelFinetune: FireworkCancelFinetuneResponseTransform,
  },
  requestHandlers: {
    uploadFile: FireworkFileUploadRequestHandler,
    cancelFinetune: FireworksCancelFinetuneRequestHandler,
  },
  requestTransforms: {
    createFinetune: FireworksRequestTransform,
  },
};

export default FireworksAIConfig;
