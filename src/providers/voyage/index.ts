import { ProviderConfigs } from '../types';
import VoyageAPIConfig from './api';
import { VoyageEmbedConfig, VoyageEmbedResponseTransform } from './embed';
import {
  VoyageMultimodalEmbedConfig,
  VoyageMultimodalEmbedResponseTransform,
} from './multimodalEmbed';
import { VoyageRerankConfig, VoyageRerankResponseTransform } from './rerank';

const VoyageConfig: ProviderConfigs = {
  embed: VoyageEmbedConfig,
  api: VoyageAPIConfig,
  multimodalEmbed: VoyageMultimodalEmbedConfig,
  rerank: VoyageRerankConfig,
  responseTransforms: {
    embed: VoyageEmbedResponseTransform,
    multimodalEmbed: VoyageMultimodalEmbedResponseTransform,
    rerank: VoyageRerankResponseTransform,
  },
};

export default VoyageConfig;
