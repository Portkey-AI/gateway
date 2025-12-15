import { ProviderConfigs } from '../types';
import AIBadgrAPIConfig from './api';
import { AIBadgrChatCompleteStreamChunkTransform } from './chatComplete';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { AIBADGR } from '../../globals';

const AIBadgrConfig: ProviderConfigs = {
  api: AIBadgrAPIConfig,
  chatComplete: chatCompleteParams([]),
  responseTransforms: {
    ...responseTransformers(AIBADGR, {
      chatComplete: true,
    }),
    'stream-chatComplete': AIBadgrChatCompleteStreamChunkTransform,
  },
};

export default AIBadgrConfig;
