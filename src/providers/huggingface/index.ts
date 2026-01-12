import { ProviderConfigs } from '../types';
import HuggingfaceAPIConfig from './api';

//text completion
import {
  HuggingfaceCompleteConfig,
  HuggingfaceCompleteResponseTransform,
  HuggingfaceCompleteStreamChunkTransform,
} from './complete';

//chat completion
import {
  HuggingfaceChatCompleteConfig,
  HuggingfaceChatCompleteResponseTransform,
  HuggingfaceChatCompleteStreamChunkTransform,
} from './chatComplete';

//image generation
import { HuggingFaceImageGenerateConfig } from './imageGenerate';
import { HuggingFaceImageGenerateResponseTransform } from './imageGenerateResponse';

const HuggingfaceConfig: ProviderConfigs = {
  api: HuggingfaceAPIConfig,

  // request configs
  complete: HuggingfaceCompleteConfig,
  chatComplete: HuggingfaceChatCompleteConfig,
  imageGenerate: HuggingFaceImageGenerateConfig,

  // response transforms

  responseTransforms: {
    complete: HuggingfaceCompleteResponseTransform,
    'stream-complete': HuggingfaceCompleteStreamChunkTransform,
    chatComplete: HuggingfaceChatCompleteResponseTransform,
    'stream-chatComplete': HuggingfaceChatCompleteStreamChunkTransform,
    imageGenerate: HuggingFaceImageGenerateResponseTransform,
  },
};

export default HuggingfaceConfig;
