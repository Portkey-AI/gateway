import { ProviderConfigs } from '../types';
import DaoXEAPIConfig from './api';
import { DaoXEChatCompleteStreamChunkTransform } from './chatComplete';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { DAOXE } from '../../globals';

const DaoXEConfig: ProviderConfigs = {
  api: DaoXEAPIConfig,
  chatComplete: chatCompleteParams([]),
  responseTransforms: {
    ...responseTransformers(DAOXE, {
      chatComplete: true,
    }),
    'stream-chatComplete': DaoXEChatCompleteStreamChunkTransform,
  },
};

export default DaoXEConfig;
