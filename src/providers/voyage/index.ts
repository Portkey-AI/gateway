import { ProviderConfigs } from '../types';
import VoyageAPIConfig from './api';
import { VoyageEmbedConfig, VoyageEmbedResponseTransform } from './embed';
import { VoyageLogConfig } from './pricing';
import { VoyageRerankConfig, VoyageRerankResponseTransform } from './rerank';

const VoyageConfig: ProviderConfigs = {
  embed: VoyageEmbedConfig,
  rerank: VoyageRerankConfig,
  api: VoyageAPIConfig,
  responseTransforms: {
    embed: VoyageEmbedResponseTransform,
    rerank: VoyageRerankResponseTransform,
  },
  pricing: VoyageLogConfig,
};

export default VoyageConfig;
