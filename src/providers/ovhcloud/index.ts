import { OVHCLOUD } from '../../globals';
import { responseTransformers } from '../open-ai-base';
import OVHcloudAPIConfig from './api';
import {
  OVHcloudChatCompleteConfig,
  OVHcloudChatCompleteStreamChunkTransform,
} from './chatComplete';

const OVHcloudConfig = {
  api: OVHcloudAPIConfig,
  chatComplete: OVHcloudChatCompleteConfig,
  responseTransforms: {
    ...responseTransformers(OVHCLOUD, {
      chatComplete: true,
    }),
    'stream-chatComplete': OVHcloudChatCompleteStreamChunkTransform,
  },
};

export default OVHcloudConfig;
