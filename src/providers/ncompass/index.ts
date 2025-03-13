import { ProviderConfigs } from '../types';
import NCompassApiConfig from './api';
import {
  NCompassChatCompleteConfig,
  NCompassChatCompleteResponseTransform,
  NCompassChatCompleteStreamChunkTransform,
} from './chatComplete';

const NCompassConfig: ProviderConfigs = {
  chatComplete: NCompassChatCompleteConfig,
  api: NCompassApiConfig,
  responseTransforms: {
    chatComplete: NCompassChatCompleteResponseTransform,
    'stream-chatComplete': NCompassChatCompleteStreamChunkTransform,
  },
};

export default NCompassConfig;
