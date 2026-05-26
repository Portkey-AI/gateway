import { ProviderConfigs } from '../types';
import KymaAPIConfig from './api';
import { KymaChatCompleteStreamChunkTransform } from './chatComplete';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { KYMA } from '../../globals';

const KymaConfig: ProviderConfigs = {
  api: KymaAPIConfig,
  chatComplete: chatCompleteParams([]),
  responseTransforms: {
    ...responseTransformers(KYMA, {
      chatComplete: true,
    }),
    'stream-chatComplete': KymaChatCompleteStreamChunkTransform,
  },
};

export default KymaConfig;
