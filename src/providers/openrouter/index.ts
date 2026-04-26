import { ProviderConfigs } from '../types';
import OpenrouterAPIConfig from './api';
import {
  OpenrouterChatCompleteConfig,
  OpenrouterChatCompleteResponseTransform,
  OpenrouterChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  OpenrouterEmbedConfig,
  OpenrouterEmbedResponseTransform,
} from './embed';

const OpenrouterConfig: ProviderConfigs = {
  chatComplete: OpenrouterChatCompleteConfig,
  embed: OpenrouterEmbedConfig,
  api: OpenrouterAPIConfig,
  responseTransforms: {
    chatComplete: OpenrouterChatCompleteResponseTransform,
    'stream-chatComplete': OpenrouterChatCompleteStreamChunkTransform,
    embed: OpenrouterEmbedResponseTransform,
  },
};

export default OpenrouterConfig;
