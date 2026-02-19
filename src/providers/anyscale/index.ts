import { ProviderConfigs } from '../types';
import AnyscaleAPIConfig from './api';
import {
  AnyscaleChatCompleteConfig,
  AnyscaleChatCompleteResponseTransform,
  AnyscaleChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  AnyscaleCompleteConfig,
  AnyscaleCompleteResponseTransform,
  AnyscaleCompleteStreamChunkTransform,
} from './complete';
import { AnyscaleEmbedConfig, AnyscaleEmbedResponseTransform } from './embed';
import { AnyscaleLogConfig } from './pricing';

const AnyscaleConfig: ProviderConfigs = {
  complete: AnyscaleCompleteConfig,
  chatComplete: AnyscaleChatCompleteConfig,
  embed: AnyscaleEmbedConfig,
  api: AnyscaleAPIConfig,
  responseTransforms: {
    'stream-complete': AnyscaleCompleteStreamChunkTransform,
    complete: AnyscaleCompleteResponseTransform,
    chatComplete: AnyscaleChatCompleteResponseTransform,
    'stream-chatComplete': AnyscaleChatCompleteStreamChunkTransform,
    embed: AnyscaleEmbedResponseTransform,
  },
  pricing: AnyscaleLogConfig,
};

export default AnyscaleConfig;
