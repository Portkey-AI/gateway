import { HYPERBOLIC } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import HyperbolicAPIConfig from './api';
import { HyperbolicChatCompleteStreamChunkTransform } from './chatComplete';
import {
  HyperbolicImageGenerateConfig,
  HyperbolicImageGenerateResponseTransform,
} from './imageGenerate';

const HyperbolicConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    [],
    {},
    {
      top_k: { param: 'top_k', default: -1 },
      min_p: { param: 'min_p', default: 0, min: 0, max: 1 },
      repetition_penalty: { param: 'repetition_penalty', default: 1 },
    }
  ),
  imageGenerate: HyperbolicImageGenerateConfig,
  api: HyperbolicAPIConfig,
  responseTransforms: {
    ...responseTransformers(HYPERBOLIC, {
      chatComplete: true,
    }),
    'stream-chatComplete': HyperbolicChatCompleteStreamChunkTransform,
    imageGenerate: HyperbolicImageGenerateResponseTransform,
  },
};

export default HyperbolicConfig;
