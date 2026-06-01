import { ProviderConfigs } from '../types';
import TritonAPIConfig from './api';
import {
  TritonCompleteConfig,
  TritonCompleteResponseTransform,
} from './complete';
import {
  TritonChatCompleteConfig,
  TritonChatCompleteResponseTransform,
  TritonChatCompleteStreamChunkTransform,
} from './chatComplete';
import { TritonEmbedConfig, TritonEmbedResponseTransform } from './embed';

const TritonConfig: ProviderConfigs = {
  api: TritonAPIConfig,
  complete: TritonCompleteConfig,
  chatComplete: TritonChatCompleteConfig,
  embed: TritonEmbedConfig,
  responseTransforms: {
    complete: TritonCompleteResponseTransform,
    chatComplete: TritonChatCompleteResponseTransform,
    'stream-chatComplete': TritonChatCompleteStreamChunkTransform,
    embed: TritonEmbedResponseTransform,
  },
};

export default TritonConfig;
