import { ProviderConfigs } from '../types';
import StabilityAIAPIConfig from './api';
import { STABILITY_V2_MODELS } from './constants';
import {
  StabilityAIImageGenerateV1Config,
  StabilityAIImageGenerateV1ResponseTransform,
} from './imageGenerate';
import {
  StabilityAIImageGenerateV2Config,
  StabilityAIIMageGenerateV2ResponseTransform,
} from './imageGenerateV2';

const StabilityAIConfig: ProviderConfigs = {
  api: StabilityAIAPIConfig,
  getConfig: (params: Params) => {
    const model = params.model;
    if (typeof model === 'string' && STABILITY_V2_MODELS.includes(model)) {
      return {
        imageGenerate: StabilityAIImageGenerateV2Config,
        responseTransforms: {
          imageGenerate: StabilityAIIMageGenerateV2ResponseTransform,
        },
      };
    }
    return {
      imageGenerate: StabilityAIImageGenerateV1Config,
      responseTransforms: {
        imageGenerate: StabilityAIImageGenerateV1ResponseTransform,
      },
    };
  },
};

export default StabilityAIConfig;
