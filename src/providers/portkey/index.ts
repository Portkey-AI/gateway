import OpenAIConfig from '../openai';
import { ProviderConfigs } from '../types';
import PortkeyAPIConfig from './api';
import { PortkeyCreateBatchConfig } from './createBatch';
import { PortkeyUploadFileRequestTransform } from './uploadFile';

const PortkeyConfig: ProviderConfigs = {
  ...OpenAIConfig,
  createBatch: PortkeyCreateBatchConfig,
  api: PortkeyAPIConfig,
  requestHandlers: {
    getBatchOutput: undefined,
  },
  requestTransforms: {
    uploadFile: PortkeyUploadFileRequestTransform,
  },
};

export default PortkeyConfig;
