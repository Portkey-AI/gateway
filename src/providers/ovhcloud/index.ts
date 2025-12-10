import OVHcloudAPIConfig from './api';
import {
  OVHcloudChatCompleteConfig,
  OVHcloudChatCompleteStreamChunkTransform,
} from './chatComplete';

const OVHcloudConfig = {
  api: OVHcloudAPIConfig,
  chatComplete: OVHcloudChatCompleteConfig,
  streamChunkTransform: OVHcloudChatCompleteStreamChunkTransform,
};

export default OVHcloudConfig;
