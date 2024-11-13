import { ProviderConfigs } from '../types';
import {
  OpenAICompleteConfig,
  OpenAICompleteResponseTransform,
} from './complete';
import { OpenAIEmbedConfig, OpenAIEmbedResponseTransform } from './embed';
import OpenAIAPIConfig from './api';
import {
  OpenAIChatCompleteConfig,
  OpenAIChatCompleteResponseTransform,
} from './chatComplete';
import {
  OpenAIImageGenerateConfig,
  OpenAIImageGenerateResponseTransform,
} from './imageGenerate';
import {
  OpenAICreateSpeechConfig,
  OpenAICreateSpeechResponseTransform,
} from './createSpeech';
import { OpenAICreateTranscriptionResponseTransform } from './createTranscription';
import { OpenAICreateTranslationResponseTransform } from './createTranslation';
import {
  OpenAIUploadFileResponseTransform,
  OpenAIFileUploadRequestTransform,
} from './uploadFile';
import { OpenAIGetFilesResponseTransform } from './getFiles';
import { OpenAIDeleteFileResponseTransform } from './deleteFile';
import { OpenAIGetFileContentResponseTransform } from './getFileContent';

const OpenAIConfig: ProviderConfigs = {
  complete: OpenAICompleteConfig,
  embed: OpenAIEmbedConfig,
  api: OpenAIAPIConfig,
  chatComplete: OpenAIChatCompleteConfig,
  imageGenerate: OpenAIImageGenerateConfig,
  createSpeech: OpenAICreateSpeechConfig,
  createTranscription: {},
  createTranslation: {},
  realtime: {},
  requestTransforms: {
    uploadFile: OpenAIFileUploadRequestTransform,
  },
  responseTransforms: {
    complete: OpenAICompleteResponseTransform,
    // 'stream-complete': OpenAICompleteResponseTransform,
    chatComplete: OpenAIChatCompleteResponseTransform,
    // 'stream-chatComplete': OpenAIChatCompleteResponseTransform,
    embed: OpenAIEmbedResponseTransform,
    imageGenerate: OpenAIImageGenerateResponseTransform,
    createSpeech: OpenAICreateSpeechResponseTransform,
    createTranscription: OpenAICreateTranscriptionResponseTransform,
    createTranslation: OpenAICreateTranslationResponseTransform,
    realtime: {},
    uploadFile: OpenAIUploadFileResponseTransform,
    getFiles: OpenAIGetFilesResponseTransform,
    getFile: OpenAIGetFilesResponseTransform,
    deleteFile: OpenAIDeleteFileResponseTransform,
    getFileContent: OpenAIGetFileContentResponseTransform,
  },
};

export default OpenAIConfig;
