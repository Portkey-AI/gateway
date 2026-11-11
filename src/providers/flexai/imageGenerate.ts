import { ParameterConfig } from '../types';

export const FlexAIImageGenerateConfig: { [key: string]: ParameterConfig } = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
    default: 'FLUX.1-schnell',
  },
  // FlexAI rejects n > 1 on /images/generations.
  n: {
    param: 'n',
    default: 1,
    min: 1,
    max: 1,
  },
  size: {
    param: 'size',
  },
};

interface FlexAIImageGenerateResponse {
  created: number;
  data: { b64_json?: string; url?: string }[];
}

export const FlexAIImageGenerateResponseTransform = (
  response: FlexAIImageGenerateResponse | Record<string, any>
) => {
  if (!('data' in response) || !Array.isArray(response.data)) return response;

  return {
    created: response.created ?? Math.floor(Date.now() / 1000),
    data: response.data.map((item: { b64_json?: string; url?: string }) => ({
      b64_json: item.b64_json,
      url: item.url,
    })),
  };
};
