import { ProviderConfigs } from '../types';
import AI302APIConfig from './api';
import {
  AI302ChatCompleteConfig,
  AI302ChatCompleteResponseTransform,
  AI302ChatCompleteStreamChunkTransform,
} from './chatComplete';

const AI302Config: ProviderConfigs = {
  chatComplete: AI302ChatCompleteConfig,
  api: AI302APIConfig,
  responseTransforms: {
    chatComplete: AI302ChatCompleteResponseTransform,
    'stream-chatComplete': AI302ChatCompleteStreamChunkTransform,
  },
};

export default AI302Config;
