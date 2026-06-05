import { AGIONE } from '../../globals';
import {
  chatCompleteParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import AGIoneAPIConfig from './api';
import { AGIoneChatCompleteStreamChunkTransform } from './chatComplete';

const AGIoneConfig: ProviderConfigs = {
  api: AGIoneAPIConfig,
  chatComplete: chatCompleteParams([]),
  embed: embedParams([]),
  responseTransforms: {
    ...responseTransformers(AGIONE, {
      chatComplete: true,
      embed: true,
    }),
    'stream-chatComplete': AGIoneChatCompleteStreamChunkTransform,
  },
};

export default AGIoneConfig;
