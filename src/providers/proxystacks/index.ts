import { ProviderConfigs } from '../types';
import ProxyStacksAPIConfig from './api';
import {
  ProxyStacksChatCompleteConfig,
  ProxyStacksChatCompleteResponseTransform,
  ProxyStacksChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  ProxyStacksEmbedConfig,
  ProxyStacksEmbedResponseTransform,
} from './embed';

const ProxyStacksConfig: ProviderConfigs = {
  api: ProxyStacksAPIConfig,
  chatComplete: ProxyStacksChatCompleteConfig,
  embed: ProxyStacksEmbedConfig,
  responseTransforms: {
    chatComplete: ProxyStacksChatCompleteResponseTransform,
    'stream-chatComplete': ProxyStacksChatCompleteStreamChunkTransform,
    embed: ProxyStacksEmbedResponseTransform,
  },
};

export default ProxyStacksConfig;
