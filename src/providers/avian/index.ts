import { AVIAN } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import AvianAPIConfig from './api';
import { AvianChatCompleteStreamChunkTransform } from './chatComplete';

const AvianConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], {
    model: 'deepseek/deepseek-v3.2',
  }),
  api: AvianAPIConfig,
  responseTransforms: {
    ...responseTransformers(AVIAN, {
      chatComplete: true,
    }),
    'stream-chatComplete': AvianChatCompleteStreamChunkTransform,
  },
};

export default AvianConfig;
