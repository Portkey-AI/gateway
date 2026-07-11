import { ProviderConfigs } from '../types';
import RequestyAPIConfig from './api';
import {
  RequestyChatCompleteConfig,
  RequestyChatCompleteResponseTransform,
  RequestyChatCompleteStreamChunkTransform,
} from './chatComplete';

const RequestyConfig: ProviderConfigs = {
  chatComplete: RequestyChatCompleteConfig,
  api: RequestyAPIConfig,
  responseTransforms: {
    chatComplete: RequestyChatCompleteResponseTransform,
    'stream-chatComplete': RequestyChatCompleteStreamChunkTransform,
  },
};

export default RequestyConfig;
