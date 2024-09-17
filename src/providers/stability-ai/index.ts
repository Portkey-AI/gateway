import { ProviderConfigs } from '../types';
import StabilityAIAPIConfig from './api';
import { STABILITY_V2_MODELS } from './constants';
import {
  StabilityAIImageGenerateConfig,
  StabilityAIImageGenerateResponseTransform,
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
      imageGenerate: StabilityAIImageGenerateConfig,
      responseTransforms: {
        imageGenerate: StabilityAIImageGenerateResponseTransform,
      },
    };
  },
};

export default StabilityAIConfig;
