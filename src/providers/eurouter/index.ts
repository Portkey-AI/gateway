import { ProviderConfigs } from '../types';
import EurouterAPIConfig from './api';
import {
  EurouterChatCompleteConfig,
  EurouterChatCompleteResponseTransform,
  EurouterChatCompleteStreamChunkTransform,
} from './chatComplete';

const EurouterConfig: ProviderConfigs = {
  chatComplete: EurouterChatCompleteConfig,
  api: EurouterAPIConfig,
  responseTransforms: {
    chatComplete: EurouterChatCompleteResponseTransform,
    'stream-chatComplete': EurouterChatCompleteStreamChunkTransform,
  },
};

export default EurouterConfig;
