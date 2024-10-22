import { ProviderConfigs } from '../types';
import StabilityAIAPIConfig from './api';
import { STABILITY_V1_MODELS } from './constants';
import {
  StabilityAIImageGenerateV1Config,
  StabilityAIImageGenerateV1ResponseTransform,
} from './imageGenerate';
import {
  StabilityAIImageGenerateV2Config,
  StabilityAIImageGenerateV2ResponseTransform,
} from './imageGenerateV2';
import { isStabilityV1Model } from './utils';

const StabilityAIConfig: ProviderConfigs = {
  api: StabilityAIAPIConfig,
  getConfig: (params: Params) => {
    const model = params.model;
    if (typeof model === 'string' && isStabilityV1Model(model)) {
      return {
        imageGenerate: StabilityAIImageGenerateV1Config,
        responseTransforms: {
          imageGenerate: StabilityAIImageGenerateV1ResponseTransform,
        },
      };
    }
    return {
      imageGenerate: StabilityAIImageGenerateV2Config,
      responseTransforms: {
        imageGenerate: StabilityAIImageGenerateV2ResponseTransform,
      },
    };
  },
};

export default StabilityAIConfig;
