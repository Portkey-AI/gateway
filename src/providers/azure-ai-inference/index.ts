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
import {
  AzureOpenAIImageGenerateConfig,
  AzureOpenAIImageGenerateResponseTransform,
} from '../azure-openai/imageGenerate';
import {
  AzureOpenAICreateSpeechConfig,
  AzureOpenAICreateSpeechResponseTransform,
} from '../azure-openai/createSpeech';
import { AzureOpenAICreateTranscriptionResponseTransform } from '../azure-openai/createTranscription';
import { AzureOpenAICreateTranslationResponseTransform } from '../azure-openai/createTranslation';
import { OpenAICreateFinetuneConfig } from '../openai/createFinetune';
import { AzureOpenAICreateBatchConfig } from '../azure-openai/createBatch';
import { AzureOpenAIResponseTransform } from '../azure-openai/chatComplete';
import { OpenAIFileUploadRequestTransform } from '../openai/uploadFile';
import { AzureAIInferenceGetBatchOutputRequestHandler } from './getBatchOutput';

const AzureAIInferenceAPIConfig: ProviderConfigs = {
  complete: AzureAIInferenceCompleteConfig,
  embed: AzureAIInferenceEmbedConfig,
  api: AzureAIInferenceAPI,
  chatComplete: AzureAIInferenceChatCompleteConfig,
  imageGenerate: AzureOpenAIImageGenerateConfig,
  imageEdit: {},
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
    imageGenerate: AzureOpenAIImageGenerateResponseTransform,
    createSpeech: AzureOpenAICreateSpeechResponseTransform,
    createTranscription: AzureOpenAICreateTranscriptionResponseTransform,
    createTranslation: AzureOpenAICreateTranslationResponseTransform,
    realtime: {},
    createBatch: AzureOpenAIResponseTransform,
    retrieveBatch: AzureOpenAIResponseTransform,
    cancelBatch: AzureOpenAIResponseTransform,
    listBatches: AzureOpenAIResponseTransform,
    uploadFile: AzureOpenAIResponseTransform,
    listFiles: AzureOpenAIResponseTransform,
    retrieveFile: AzureOpenAIResponseTransform,
    deleteFile: AzureOpenAIResponseTransform,
    retrieveFileContent: AzureOpenAIResponseTransform,
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
