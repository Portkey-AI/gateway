import OpenAIConfig from '../openai';
import { ProviderConfigs } from '../types';
import PortkeyAPIConfig from './api';
import { PortkeyCreateBatchConfig } from './createBatch';
import { PortkeyCreateFinetuneConfig } from './createFinetune';
import { PortkeyBatchGetOutputHandler } from './getBatchOutput';
import { PortkeyUploadFileRequestTransform } from './uploadFile';

const PortkeyConfig: ProviderConfigs = {
  ...OpenAIConfig,
  createBatch: PortkeyCreateBatchConfig,
  createFinetune: PortkeyCreateFinetuneConfig,
  api: PortkeyAPIConfig,
  requestHandlers: {
    getBatchOutput: PortkeyBatchGetOutputHandler,
  },
  requestTransforms: {
    uploadFile: PortkeyUploadFileRequestTransform,
  },
};

export default PortkeyConfig;
