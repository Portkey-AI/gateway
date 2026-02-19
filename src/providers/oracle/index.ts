import { ProviderConfigs } from '../types';
import OracleAPIConfig from './api';
import {
  OracleChatCompleteConfig,
  OracleChatCompleteResponseTransform,
  OracleChatCompleteStreamChunkTransform,
} from './chatComplete';
import { OracleLogConfig } from './pricing';

const OracleConfig: ProviderConfigs = {
  chatComplete: OracleChatCompleteConfig,
  api: OracleAPIConfig,
  responseTransforms: {
    chatComplete: OracleChatCompleteResponseTransform,
    'stream-chatComplete': OracleChatCompleteStreamChunkTransform,
  },
  pricing: OracleLogConfig,
};

export default OracleConfig;
