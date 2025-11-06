import { ParameterConfig } from '../types';

export const NscaleImageGenerateConfig: { [key: string]: ParameterConfig } = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
  },
  n: {
    param: 'n',
  },
  size: {
    param: 'size',
  },
};

export const NscaleImageGenerateResponseTransform = (response: any) => {
  return {
    created: Date.now(),
    data: response.data.map((item: any) => ({
      url: item.url,
      b64_json: item.b64_json,
    })),
  };
};
