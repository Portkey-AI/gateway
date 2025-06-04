import { ProviderConfigs } from '../types';
import CohereAPIConfig from './api';
import { CohereCancelBatchResponseTransform } from './cancelBatch';
import {
  CohereChatCompleteConfig,
  CohereChatCompleteResponseTransform,
  CohereChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  CohereCompleteConfig,
  CohereCompleteResponseTransform,
  CohereCompleteStreamChunkTransform,
} from './complete';
import {
  CohereCreateBatchConfig,
  CohereCreateBatchResponseTransform,
} from './createBatch';
import { CohereDeleteFileResponseTransform } from './deleteFile';
import { CohereEmbedConfig, CohereEmbedResponseTransform } from './embed';
import { CohereGetBatchOutputHandler } from './getBatchOutput';
import {
  CohereGetFileResponseTransform,
  CohereGetFilesResponseTransform,
} from './getFiles';
import { CohereListBatchResponseTransform } from './listBatches';
import { CohereRetrieveBatchResponseTransform } from './retrieveBatch';
import {
  CohereUploadFileRequestTransform,
  CohereUploadFileResponseTransform,
} from './uploadFile';

const CohereConfig: ProviderConfigs = {
  complete: CohereCompleteConfig,
  chatComplete: CohereChatCompleteConfig,
  embed: CohereEmbedConfig,
  api: CohereAPIConfig,
  createBatch: CohereCreateBatchConfig,
  cancelBatch: {},
  requestHandlers: {
    getBatchOutput: CohereGetBatchOutputHandler,
  },
  requestTransforms: {
    uploadFile: CohereUploadFileRequestTransform,
  },
  responseTransforms: {
    complete: CohereCompleteResponseTransform,
    'stream-complete': CohereCompleteStreamChunkTransform,
    chatComplete: CohereChatCompleteResponseTransform,
    'stream-chatComplete': CohereChatCompleteStreamChunkTransform,
    embed: CohereEmbedResponseTransform,
    uploadFile: CohereUploadFileResponseTransform,
    retrieveFile: CohereGetFileResponseTransform,
    listFiles: CohereGetFilesResponseTransform,
    deleteFile: CohereDeleteFileResponseTransform,
    createBatch: CohereCreateBatchResponseTransform,
    listBatches: CohereListBatchResponseTransform,
    retrieveBatch: CohereRetrieveBatchResponseTransform,
    cancelBatch: CohereCancelBatchResponseTransform,
  },
};

export default CohereConfig;
