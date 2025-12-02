import { ProviderConfigs } from '../types';
import OracleAPIConfig from './api';
import {
  OracleChatCompleteConfig,
  OracleChatCompleteResponseTransform,
  OracleChatCompleteStreamChunkTransform,
} from './chatComplete';

const OracleConfig: ProviderConfigs = {
  chatComplete: OracleChatCompleteConfig,
  api: OracleAPIConfig,
  responseTransforms: {
    chatComplete: OracleChatCompleteResponseTransform,
    'stream-chatComplete': OracleChatCompleteStreamChunkTransform,
  },
};

export default OracleConfig;
