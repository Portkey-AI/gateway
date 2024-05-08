import { ProviderConfigs } from '../types';
import CozeAPIConfig from './api';
import {
  CozeChatCompleteConfig,
  CozeChatCompleteResponseTransform,
  CozeChatCompleteStreamChunkTransform,
} from './chatComplete';

const CozeConfig: ProviderConfigs = {
  chatComplete: CozeChatCompleteConfig,
  api: CozeAPIConfig,
  responseTransforms: {
    chatComplete: CozeChatCompleteResponseTransform,
    'stream-chatComplete': CozeChatCompleteStreamChunkTransform,
  },
};

export default CozeConfig;
