import { ProviderConfigs } from '../types';
import JinaAPIConfig from './api';
import { JinaEmbedConfig, JinaEmbedResponseTransform } from './embed';
import { JinaLogConfig } from './pricing';
import { JinaRerankConfig, JinaRerankResponseTransform } from './rerank';

const JinaConfig: ProviderConfigs = {
  embed: JinaEmbedConfig,
  rerank: JinaRerankConfig,
  api: JinaAPIConfig,
  responseTransforms: {
    embed: JinaEmbedResponseTransform,
    rerank: JinaRerankResponseTransform,
  },
  pricing: JinaLogConfig,
};

export default JinaConfig;
