import { ProviderConfigs } from '../types';
import OracleAPIConfig from './api';
import {
  OracleChatCompleteConfig,
  OracleChatCompleteResponseTransform,
  OracleChatCompleteStreamChunkTransform,
} from './chatComplete';
import { OracleEmbedConfig, OracleEmbedResponseTransform } from './embed';
import { OracleRerankConfig, OracleRerankResponseTransform } from './rerank';
import {
  OracleGuardrailsConfig,
  OracleGuardrailsResponseTransform,
} from './guardrails';

const OracleConfig: ProviderConfigs = {
  chatComplete: OracleChatCompleteConfig,
  embed: OracleEmbedConfig,
  rerank: OracleRerankConfig,
  moderate: OracleGuardrailsConfig,
  api: OracleAPIConfig,
  responseTransforms: {
    chatComplete: OracleChatCompleteResponseTransform,
    'stream-chatComplete': OracleChatCompleteStreamChunkTransform,
    embed: OracleEmbedResponseTransform,
    rerank: OracleRerankResponseTransform,
    moderate: OracleGuardrailsResponseTransform,
  },
};

export default OracleConfig;
