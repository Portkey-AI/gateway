import { EMBER_CLOUD } from '../../globals';
import { responseTransformers } from '../open-ai-base';
import EmberCloudAPIConfig from './api';
import {
  EmberCloudChatCompleteConfig,
  EmberCloudChatCompleteStreamChunkTransform,
} from './chatComplete';

const EmberCloudConfig = {
  api: EmberCloudAPIConfig,
  chatComplete: EmberCloudChatCompleteConfig,
  responseTransforms: {
    ...responseTransformers(EMBER_CLOUD, {
      chatComplete: true,
    }),
    'stream-chatComplete': EmberCloudChatCompleteStreamChunkTransform,
  },
};

export default EmberCloudConfig;
