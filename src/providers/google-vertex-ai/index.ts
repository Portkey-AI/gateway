import { ProviderConfigs } from '../types';
import VertexApiConfig from './api';
import {
  GoogleChatCompleteConfig,
  GoogleChatCompleteResponseTransform,
  GoogleChatCompleteStreamChunkTransform,
} from './chatComplete';

const VertexConfig: ProviderConfigs = {
  api: VertexApiConfig,
  chatComplete: GoogleChatCompleteConfig,
  responseTransforms: {
    chatComplete: GoogleChatCompleteResponseTransform,
    'stream-chatComplete': GoogleChatCompleteStreamChunkTransform,
  },
};

export default VertexConfig;
