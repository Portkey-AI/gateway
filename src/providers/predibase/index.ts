import { ProviderConfigs } from '../types';
import PredibaseAPIConfig from './api';
import {
  PredibaseChatCompleteConfig,
  PredibaseChatCompleteResponseTransform,
  PredibaseChatCompleteStreamChunkTransform,
} from './chatComplete';
import { PredibaseLogConfig } from './pricing';

const PredibaseConfig: ProviderConfigs = {
  chatComplete: PredibaseChatCompleteConfig,
  api: PredibaseAPIConfig,
  responseTransforms: {
    chatComplete: PredibaseChatCompleteResponseTransform,
    'stream-chatComplete': PredibaseChatCompleteStreamChunkTransform,
  },
  pricing: PredibaseLogConfig,
};

export default PredibaseConfig;
