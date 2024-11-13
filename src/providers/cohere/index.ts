import { ProviderConfigs } from '../types';
import CohereAPIConfig from './api';
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
import { CohereDeleteFileResponseTransform } from './deleteFile';
import { CohereEmbedConfig, CohereEmbedResponseTransform } from './embed';
import {
  CohereGetFileResponseTransform,
  CohereGetFilesResponseTransform,
} from './getFiles';
import {
  CohereUploadFileRequestTransform,
  CohereUploadFileResponseTransform,
} from './uploadFile';

const CohereConfig: ProviderConfigs = {
  complete: CohereCompleteConfig,
  chatComplete: CohereChatCompleteConfig,
  embed: CohereEmbedConfig,
  api: CohereAPIConfig,
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
    getFile: CohereGetFileResponseTransform,
    getFiles: CohereGetFilesResponseTransform,
    deleteFile: CohereDeleteFileResponseTransform,
  },
};

export default CohereConfig;
