import { ProviderConfigs } from '../types';
import StabilityAIAPIConfig from './api';
import {
  StabilityAIImageGenerateV1Config,
  StabilityAIImageGenerateV1ResponseTransform,
} from './imageGenerate';
import {
  StabilityAIImageGenerateV2Config,
  StabilityAIImageGenerateV2ResponseTransform,
} from './imageGenerateV2';
import { isStabilityV1Model } from './utils';
import { StabilityAiLogConfig } from './pricing';

const StabilityAIConfig: ProviderConfigs = {
  api: StabilityAIAPIConfig,
  pricing: StabilityAiLogConfig,
  getConfig: ({ params }) => {
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
