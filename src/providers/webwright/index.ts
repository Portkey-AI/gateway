import { ProviderConfigs } from '../types';
import WebWrightAPIConfig from './api';
import {
  WebWrightChatCompleteConfig,
  WebWrightChatCompleteResponseTransform,
  WebWrightChatCompleteStreamChunkTransform,
} from './chatComplete';

const WebWrightConfig: ProviderConfigs = {
  chatComplete: WebWrightChatCompleteConfig,
  api: WebWrightAPIConfig,
  responseTransforms: {
    chatComplete: WebWrightChatCompleteResponseTransform,
    'stream-chatComplete': WebWrightChatCompleteStreamChunkTransform,
  },
};

export default WebWrightConfig;
