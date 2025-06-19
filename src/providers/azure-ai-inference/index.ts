import { ProviderConfigs } from '../types';
import {
  AzureAIInferenceCompleteConfig,
  AzureAIInferenceCompleteResponseTransform,
} from './complete';
import {
  AzureAIInferenceEmbedConfig,
  AzureAIInferenceEmbedResponseTransform,
} from './embed';
import AzureAIInferenceAPI from './api';
import {
  AzureAIInferenceChatCompleteConfig,
  AzureAIInferenceChatCompleteResponseTransform,
} from './chatComplete';
import { AZURE_AI_INFERENCE, GITHUB } from '../../globals';
import { AzureOpenAIImageGenerateConfig } from '../azure-openai/imageGenerate';
import { AzureOpenAICreateSpeechConfig } from '../azure-openai/createSpeech';
import { OpenAICreateFinetuneConfig } from '../openai/createFinetune';
import { AzureOpenAICreateBatchConfig } from '../azure-openai/createBatch';
import { AzureAIInferenceGetBatchOutputRequestHandler } from './getBatchOutput';
import { OpenAIFileUploadRequestTransform } from '../openai/uploadFile';
import {
  AzureAIInferenceCreateSpeechResponseTransform,
  AzureAIInferenceCreateTranscriptionResponseTransform,
  AzureAIInferenceCreateTranslationResponseTransform,
  AzureAIInferenceResponseTransform,
} from './utils';

const AzureAIInferenceAPIConfig: ProviderConfigs = {
  complete: AzureAIInferenceCompleteConfig,
  embed: AzureAIInferenceEmbedConfig,
  api: AzureAIInferenceAPI,
  chatComplete: AzureAIInferenceChatCompleteConfig,
  imageGenerate: AzureOpenAIImageGenerateConfig,
  createSpeech: AzureOpenAICreateSpeechConfig,
  createFinetune: OpenAICreateFinetuneConfig,
  createTranscription: {},
  createTranslation: {},
  realtime: {},
  cancelBatch: {},
  createBatch: AzureOpenAICreateBatchConfig,
  cancelFinetune: {},
  requestHandlers: {
    getBatchOutput: AzureAIInferenceGetBatchOutputRequestHandler,
  },
  requestTransforms: {
    uploadFile: OpenAIFileUploadRequestTransform,
  },
  responseTransforms: {
    complete: AzureAIInferenceCompleteResponseTransform(AZURE_AI_INFERENCE),
    chatComplete:
      AzureAIInferenceChatCompleteResponseTransform(AZURE_AI_INFERENCE),
    embed: AzureAIInferenceEmbedResponseTransform(AZURE_AI_INFERENCE),
    imageGenerate: AzureAIInferenceResponseTransform,
    createSpeech: AzureAIInferenceCreateSpeechResponseTransform,
    createTranscription: AzureAIInferenceCreateTranscriptionResponseTransform,
    createTranslation: AzureAIInferenceCreateTranslationResponseTransform,
    realtime: {},
    createBatch: AzureAIInferenceResponseTransform,
    retrieveBatch: AzureAIInferenceResponseTransform,
    cancelBatch: AzureAIInferenceResponseTransform,
    listBatches: AzureAIInferenceResponseTransform,
    uploadFile: AzureAIInferenceResponseTransform,
    listFiles: AzureAIInferenceResponseTransform,
    retrieveFile: AzureAIInferenceResponseTransform,
    deleteFile: AzureAIInferenceResponseTransform,
    retrieveFileContent: AzureAIInferenceResponseTransform,
  },
};

const GithubModelAPiConfig: ProviderConfigs = {
  complete: AzureAIInferenceCompleteConfig,
  embed: AzureAIInferenceEmbedConfig,
  api: AzureAIInferenceAPI,
  chatComplete: AzureAIInferenceChatCompleteConfig,
  responseTransforms: {
    complete: AzureAIInferenceCompleteResponseTransform(GITHUB),
    chatComplete: AzureAIInferenceChatCompleteResponseTransform(GITHUB),
    embed: AzureAIInferenceEmbedResponseTransform(GITHUB),
  },
};

export { AzureAIInferenceAPIConfig, GithubModelAPiConfig };
