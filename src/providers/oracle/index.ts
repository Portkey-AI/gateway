import { ProviderConfigs } from '../types';
import OracleAPIConfig from './api';
import {
  OracleChatCompleteConfig,
  OracleChatCompleteResponseTransform,
  OracleChatCompleteStreamChunkTransform,
} from './chatComplete';
import { OracleEmbedConfig, OracleEmbedResponseTransform } from './embed';
import { OracleRerankConfig, OracleRerankResponseTransform } from './rerank';

const OracleConfig: ProviderConfigs = {
  chatComplete: OracleChatCompleteConfig,
  embed: OracleEmbedConfig,
  rerank: OracleRerankConfig,
  api: OracleAPIConfig,
  responseTransforms: {
    chatComplete: OracleChatCompleteResponseTransform,
    'stream-chatComplete': OracleChatCompleteStreamChunkTransform,
    embed: OracleEmbedResponseTransform,
    rerank: OracleRerankResponseTransform,
  },
};

export default OracleConfig;
