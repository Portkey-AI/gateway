import { ProviderConfigs } from '../types';
import CometAPIAPIConfig from './api';
import {
  CometAPIChatCompleteConfig,
  CometAPIChatCompleteResponseTransform,
  CometAPIChatCompleteStreamChunkTransform,
} from './chatComplete';
import { CometAPIEmbedConfig, CometAPIEmbedResponseTransform } from './embed';

const CometAPIConfig: ProviderConfigs = {
  api: CometAPIAPIConfig,
  chatComplete: CometAPIChatCompleteConfig,
  embed: CometAPIEmbedConfig,
  responseTransforms: {
    chatComplete: CometAPIChatCompleteResponseTransform,
    'stream-chatComplete': CometAPIChatCompleteStreamChunkTransform,
    embed: CometAPIEmbedResponseTransform,
  },
};

export default CometAPIConfig;
