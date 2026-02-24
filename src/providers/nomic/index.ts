import { ProviderConfigs } from '../types';
import NomicAPIConfig from './api';
import { NomicEmbedConfig, NomicEmbedResponseTransform } from './embed';
import { NomicLogConfig } from './pricing';

const NomicConfig: ProviderConfigs = {
  embed: NomicEmbedConfig,
  api: NomicAPIConfig,
  responseTransforms: {
    embed: NomicEmbedResponseTransform,
  },
  pricing: NomicLogConfig,
};

export default NomicConfig;
