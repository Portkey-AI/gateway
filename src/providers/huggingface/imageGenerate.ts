import { ProviderConfig } from '../types';

export const HuggingFaceImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'inputs',
    required: true,
  },

  negative_prompt: {
    param: 'parameters.negative_prompt',
    required: false,
  },

  guidance_scale: {
    param: 'parameters.guidance_scale',
    required: false,
  },

  steps: {
    param: 'parameters.num_inference_steps',
    required: false,
  },

  seed: {
    param: 'parameters.seed',
    required: false,
  },

  image: {
    param: 'image',
    required: false,
  },

  strength: {
    param: 'parameters.strength',
    required: false,
  },

  output_format: {
    param: 'parameters.output_format',
    required: false,
  },
};
