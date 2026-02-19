import { ProviderConfigs } from '../types';
import GoogleApiConfig from './api';
import {
  GoogleChatCompleteConfig,
  GoogleChatCompleteResponseTransform,
  GoogleChatCompleteStreamChunkTransform,
} from './chatComplete';
import { GoogleEmbedConfig, GoogleEmbedResponseTransform } from './embed';
import { GoogleLogConfig } from './pricing';

const GoogleConfig: ProviderConfigs = {
  api: GoogleApiConfig,
  chatComplete: GoogleChatCompleteConfig,
  embed: GoogleEmbedConfig,
  responseTransforms: {
    chatComplete: GoogleChatCompleteResponseTransform,
    'stream-chatComplete': GoogleChatCompleteStreamChunkTransform,
    embed: GoogleEmbedResponseTransform,
  },
  pricing: GoogleLogConfig,
};

export default GoogleConfig;
