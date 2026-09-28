import { ProviderConfigs } from '../types';
import FriendliAPIConfig from './api';
import {
  FriendliChatCompleteConfig,
  FriendliChatCompleteResponseTransform,
  FriendliChatCompleteStreamChunkTransform,
} from './chatComplete';

const FriendliConfig: ProviderConfigs = {
  chatComplete: FriendliChatCompleteConfig,
  api: FriendliAPIConfig,
  responseTransforms: {
    chatComplete: FriendliChatCompleteResponseTransform,
    'stream-chatComplete': FriendliChatCompleteStreamChunkTransform,
  },
};

export default FriendliConfig;
