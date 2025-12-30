import { ProviderConfigs } from '../types';
import {
  AzureOpenAICompleteConfig,
  AzureOpenAICompleteResponseTransform,
} from './complete';
import {
  AzureOpenAIEmbedConfig,
  AzureOpenAIEmbedResponseTransform,
} from './embed';
import AzureOpenAIAPIConfig from './api';
import {
  AzureOpenAIChatCompleteConfig,
  AzureOpenAIResponseTransform,
} from './chatComplete';
import {
  AzureOpenAIImageGenerateConfig,
  AzureOpenAIImageGenerateResponseTransform,
} from './imageGenerate';
import {
  AzureOpenAICreateSpeechConfig,
  AzureOpenAICreateSpeechResponseTransform,
} from './createSpeech';
import { AzureOpenAICreateTranscriptionResponseTransform } from './createTranscription';
import { AzureOpenAICreateTranslationResponseTransform } from './createTranslation';
import { OpenAICreateFinetuneConfig } from '../openai/createFinetune';
import { AzureTransformFinetuneBody } from './createFinetune';
import { OpenAIFileUploadRequestTransform } from '../openai/uploadFile';
import {
  AzureOpenAIFinetuneResponseTransform,
  getAzureModelValue,
} from './utils';
import { AzureOpenAICreateBatchConfig } from './createBatch';
import { AzureOpenAIGetBatchOutputRequestHandler } from './getBatchOutput';
import {
  createModelResponseParams,
  OpenAICreateModelResponseTransformer,
  OpenAIDeleteModelResponseTransformer,
  OpenAIGetModelResponseTransformer,
  OpenAIListInputItemsResponseTransformer,
  OpenAIResponseTransform,
} from '../open-ai-base';
import { AZURE_OPEN_AI } from '../../globals';

const AzureOpenAIConfig: ProviderConfigs = {
  complete: AzureOpenAICompleteConfig,
  embed: AzureOpenAIEmbedConfig,
  api: AzureOpenAIAPIConfig,
  imageGenerate: AzureOpenAIImageGenerateConfig,
  imageEdit: {},
  chatComplete: AzureOpenAIChatCompleteConfig,
  createSpeech: AzureOpenAICreateSpeechConfig,
  createFinetune: OpenAICreateFinetuneConfig,
  createTranscription: {},
  createTranslation: {},
  realtime: {},
  cancelFinetune: {},
  cancelBatch: {},
  createBatch: AzureOpenAICreateBatchConfig,
  createModelResponse: createModelResponseParams(
    [],
    {},
    {
      model: {
        param: 'model',
        transform: getAzureModelValue,
      },
    }
  ),
  getModelResponse: {},
  deleteModelResponse: {},
  listModelsResponse: {},
  requestHandlers: {
    getBatchOutput: AzureOpenAIGetBatchOutputRequestHandler,
  },
  responseTransforms: {
    complete: AzureOpenAICompleteResponseTransform,
    chatComplete: AzureOpenAIResponseTransform,
    embed: AzureOpenAIEmbedResponseTransform,
    imageGenerate: AzureOpenAIImageGenerateResponseTransform,
    createSpeech: AzureOpenAICreateSpeechResponseTransform,
    createTranscription: AzureOpenAICreateTranscriptionResponseTransform,
    createTranslation: AzureOpenAICreateTranslationResponseTransform,
    realtime: {},
    uploadFile: OpenAIResponseTransform,
    listFiles: OpenAIResponseTransform,
    retrieveFile: OpenAIResponseTransform,
    deleteFile: OpenAIResponseTransform,
    retrieveFileContent: OpenAIResponseTransform,
    createFinetune: OpenAIResponseTransform,
    retrieveFinetune: AzureOpenAIFinetuneResponseTransform,
    createBatch: AzureOpenAIResponseTransform,
    retrieveBatch: AzureOpenAIResponseTransform,
    cancelBatch: AzureOpenAIResponseTransform,
    listBatches: AzureOpenAIResponseTransform,
    createModelResponse: OpenAICreateModelResponseTransformer(AZURE_OPEN_AI),
    getModelResponse: OpenAIGetModelResponseTransformer(AZURE_OPEN_AI),
    deleteModelResponse: OpenAIDeleteModelResponseTransformer(AZURE_OPEN_AI),
    listModelsResponse: OpenAIListInputItemsResponseTransformer(AZURE_OPEN_AI),
  },
  requestTransforms: {
    createFinetune: AzureTransformFinetuneBody,
    uploadFile: OpenAIFileUploadRequestTransform,
  },
};

export default AzureOpenAIConfig;
