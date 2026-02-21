import { ProviderConfigs } from '../types';
import GoogleApiConfig from './api';
import {
  GoogleChatCompleteConfig,
  GoogleChatCompleteResponseTransform,
  GoogleChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  GoogleCountTokensConfig,
  GoogleCountTokensResponseTransform,
} from './countTokens';
import { GoogleEmbedConfig, GoogleEmbedResponseTransform } from './embed';

const GoogleConfig: ProviderConfigs = {
  api: GoogleApiConfig,
  chatComplete: GoogleChatCompleteConfig,
  embed: GoogleEmbedConfig,
  messagesCountTokens: GoogleCountTokensConfig,
  responseTransforms: {
    chatComplete: GoogleChatCompleteResponseTransform,
    'stream-chatComplete': GoogleChatCompleteStreamChunkTransform,
    embed: GoogleEmbedResponseTransform,
    messagesCountTokens: GoogleCountTokensResponseTransform,
  },
};

export default GoogleConfig;
