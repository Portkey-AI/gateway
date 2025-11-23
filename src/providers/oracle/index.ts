import { ProviderConfigs } from '../types';
import OracleAPIConfig from './api';
import {
  OracleChatCompleteConfig,
  OracleChatCompleteResponseTransform,
} from './chatComplete';

const OracleConfig: ProviderConfigs = {
  chatComplete: OracleChatCompleteConfig,
  api: OracleAPIConfig,
  responseTransforms: {
    chatComplete: OracleChatCompleteResponseTransform,
  },
};

export default OracleConfig;
