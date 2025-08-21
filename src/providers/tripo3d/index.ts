import { ProviderConfigs } from '../types';
import Tripo3DAPIConfig from './api';
import {
  Tripo3DCreateTaskConfig,
  Tripo3DCreateTaskResponseTransform,
} from './createTask';
import {
  Tripo3DGetTaskConfig,
  Tripo3DGetTaskResponseTransform,
} from './getTask';
import {
  Tripo3DUploadFileConfig,
  Tripo3DGetStsTokenConfig,
  Tripo3DUploadResponseTransform,
  Tripo3DStsTokenResponseTransform,
} from './upload';
import {
  Tripo3DGetBalanceConfig,
  Tripo3DBalanceResponseTransform,
} from './balance';

const Tripo3DConfig: ProviderConfigs = {
  createTask: Tripo3DCreateTaskConfig,
  getTask: Tripo3DGetTaskConfig,
  uploadFile: Tripo3DUploadFileConfig,
  getStsToken: Tripo3DGetStsTokenConfig,
  getBalance: Tripo3DGetBalanceConfig,
  api: Tripo3DAPIConfig,
  responseTransforms: {
    createTask: Tripo3DCreateTaskResponseTransform,
    getTask: Tripo3DGetTaskResponseTransform,
    uploadFile: Tripo3DUploadResponseTransform,
    getStsToken: Tripo3DStsTokenResponseTransform,
    getBalance: Tripo3DBalanceResponseTransform,
  },
};

export default Tripo3DConfig;
