import { createModelResponseParams } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import OpenrouterAPIConfig from './api';
import {
  OpenrouterChatCompleteConfig,
  OpenrouterChatCompleteResponseTransform,
  OpenrouterChatCompleteStreamChunkTransform,
} from './chatComplete';
import { OpenrouterLogConfig } from './pricing';

const OpenrouterConfig: ProviderConfigs = {
  chatComplete: OpenrouterChatCompleteConfig,
  createModelResponse: createModelResponseParams([]),
  api: OpenrouterAPIConfig,
  responseTransforms: {
    chatComplete: OpenrouterChatCompleteResponseTransform,
    'stream-chatComplete': OpenrouterChatCompleteStreamChunkTransform,
  },
  pricing: OpenrouterLogConfig,
};

export default OpenrouterConfig;
