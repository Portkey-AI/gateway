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
import { OpenAIGetFilesResponseTransform } from './listFiles';
import { OpenAIDeleteFileResponseTransform } from './deleteFile';
import { OpenAIGetFileContentResponseTransform } from './retrieveFileContent';
import {
  OpenAICreateBatchConfig,
  OpenAICreateBatchResponseTransform,
} from './createBatch';
import { OpenAIRetrieveBatchResponseTransform } from './retrieveBatch';
import { OpenAICancelBatchResponseTransform } from './cancelBatch';
import { OpenAIListBatchesResponseTransform } from './listBatches';
import { OpenAIGetBatchOutputRequestHandler } from './getBatchOutput';
import {
  OpenAICreateFinetuneConfig,
  OpenAIFinetuneResponseTransform,
} from './createFinetune';
import {
  createModelResponseParams,
  OpenAICreateModelResponseTransformer,
  OpenAIGetModelResponseTransformer,
  OpenAIDeleteModelResponseTransformer,
  OpenAIListInputItemsResponseTransformer,
} from '../open-ai-base';
import { OPEN_AI } from '../../globals';

const OpenAIConfig: ProviderConfigs = {
  complete: OpenAICompleteConfig,
  embed: OpenAIEmbedConfig,
  api: OpenAIAPIConfig,
  chatComplete: OpenAIChatCompleteConfig,
  imageGenerate: OpenAIImageGenerateConfig,
  imageEdit: {},
  createSpeech: OpenAICreateSpeechConfig,
  createTranscription: {},
  createTranslation: {},
  realtime: {},
  createBatch: OpenAICreateBatchConfig,
  createFinetune: OpenAICreateFinetuneConfig,
  cancelBatch: {},
  cancelFinetune: {},
  createModelResponse: createModelResponseParams([]),
  getModelResponse: {},
  deleteModelResponse: {},
  listModelsResponse: {},
  requestHandlers: {
    getBatchOutput: OpenAIGetBatchOutputRequestHandler,
  },
  requestTransforms: {
    uploadFile: OpenAIFileUploadRequestTransform,
  },
  responseTransforms: {
    complete: OpenAICompleteResponseTransform,
    // 'stream-complete': OpenAICompleteResponseTransform,
    chatComplete: OpenAIChatCompleteResponseTransform,
    // 'stream-chatComplete': OpenAIChatCompleteResponseTransform,
    imageGenerate: OpenAIImageGenerateResponseTransform,
    createSpeech: OpenAICreateSpeechResponseTransform,
    createTranscription: OpenAICreateTranscriptionResponseTransform,
    createTranslation: OpenAICreateTranslationResponseTransform,
    realtime: {},
    uploadFile: OpenAIUploadFileResponseTransform,
    listFiles: OpenAIGetFilesResponseTransform,
    retrieveFile: OpenAIGetFilesResponseTransform,
    deleteFile: OpenAIDeleteFileResponseTransform,
    retrieveFileContent: OpenAIGetFileContentResponseTransform,
    createBatch: OpenAICreateBatchResponseTransform,
    retrieveBatch: OpenAIRetrieveBatchResponseTransform,
    cancelBatch: OpenAICancelBatchResponseTransform,
    listBatches: OpenAIListBatchesResponseTransform,
    createFinetune: OpenAIFinetuneResponseTransform,
    retrieveFinetune: OpenAIFinetuneResponseTransform,
    createModelResponse: OpenAICreateModelResponseTransformer(OPEN_AI),
    getModelResponse: OpenAIGetModelResponseTransformer(OPEN_AI),
    deleteModelResponse: OpenAIDeleteModelResponseTransformer(OPEN_AI),
    listModelsResponse: OpenAIListInputItemsResponseTransformer(OPEN_AI),
  },
};

export default OpenAIConfig;
