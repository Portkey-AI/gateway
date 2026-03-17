import { ProviderConfigs } from '../types';
import LatitudeAPIConfig from './api';
import {
  LatitudeChatCompleteConfig,
  LatitudeChatCompleteResponseTransform,
  LatitudeChatCompleteStreamChunkTransform,
} from './chatComplete';

const LatitudeConfig: ProviderConfigs = {
  chatComplete: LatitudeChatCompleteConfig,
  api: LatitudeAPIConfig,
  responseTransforms: {
    chatComplete: LatitudeChatCompleteResponseTransform,
    'stream-chatComplete': LatitudeChatCompleteStreamChunkTransform,
  },
};

export default LatitudeConfig;
