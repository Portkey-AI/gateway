import { ProviderConfigs } from '../types';
import {
  HuggingFaceCompleteConfig,
  HuggingFaceCompleteResponseTransform,
  HuggingFaceCompleteStreamChunkTransform,
} from './complete';
import HuggingFaceAPIConfig from './api';
import {
  HuggingFaceChatCompleteConfig,
  HuggingFaceChatCompleteResponseTransform,
  HuggingFaceChatCompleteStreamChunkTransform,
} from './chatComplete';

const HuggingFaceConfig: ProviderConfigs = {
  complete: HuggingFaceCompleteConfig,
  api: HuggingFaceAPIConfig,
  chatComplete: HuggingFaceChatCompleteConfig,
  responseTransforms: {
    complete: HuggingFaceCompleteResponseTransform,
    'stream-complete': HuggingFaceCompleteStreamChunkTransform,
    chatComplete: HuggingFaceChatCompleteResponseTransform,
    'stream-chatComplete': HuggingFaceChatCompleteStreamChunkTransform,
  },
};

export default HuggingFaceConfig;
