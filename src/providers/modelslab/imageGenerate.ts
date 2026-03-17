import { MODELSLAB } from '../../globals';
import { Options } from '../../types/requestBody';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const ModelsLabImageGenerateConfig: ProviderConfig = {
  // Inject the API key into the request body (ModelsLab requires "key" in JSON body)
  _key: {
    param: 'key',
    required: true,
    default: (_params: any, providerOptions: Options) => providerOptions.apiKey,
  },
  prompt: {
    param: 'prompt',
    required: true,
  },
  model: {
    param: 'model_id',
    default: 'flux',
  },
  n: {
    param: 'samples',
    default: 1,
    min: 1,
    max: 4,
  },
  size: [
    {
      param: 'width',
      transform: (params: any) => {
        if (!params.size) return 512;
        return parseInt(params.size.toLowerCase().split('x')[0]);
      },
      min: 256,
    },
    {
      param: 'height',
      transform: (params: any) => {
        if (!params.size) return 512;
        return parseInt(params.size.toLowerCase().split('x')[1]);
      },
      min: 256,
    },
  ],
  steps: {
    param: 'num_inference_steps',
    default: 30,
    min: 1,
    max: 50,
  },
  guidance_scale: {
    param: 'guidance_scale',
    default: 7.5,
    min: 1,
    max: 20,
  },
  seed: {
    param: 'seed',
  },
  negative_prompt: {
    param: 'negative_prompt',
  },
  safety_checker: {
    param: 'safety_checker',
    default: 'no',
  },
  webhook: {
    param: 'webhook',
  },
  track_id: {
    param: 'track_id',
  },
};

interface ModelsLabImageGenerateSuccessResponse {
  status: 'success';
  generationTime: number;
  id: number;
  output: string[];
  nsfw_content_detected: string[] | null;
  meta: Record<string, any>;
}

interface ModelsLabImageGenerateProcessingResponse {
  status: 'processing';
  id: number;
  output: string[] | null;
  fetch_result: string;
  eta: number;
  message: string;
  messege?: string;
}

interface ModelsLabImageGenerateErrorResponse {
  status: 'error';
  message: string;
  messege?: string; // Legacy typo in older API versions
}

type ModelsLabImageGenerateResponse =
  | ModelsLabImageGenerateSuccessResponse
  | ModelsLabImageGenerateProcessingResponse
  | ModelsLabImageGenerateErrorResponse;

export const ModelsLabImageGenerateResponseTransform: (
  response: ModelsLabImageGenerateResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || response.status === 'error') {
    const message =
      ('message' in response && response.message) ||
      ('messege' in response && response.messege) ||
      'Unknown error occurred';
    return generateErrorResponse(
      {
        message: message as string,
        type: 'ModelsLabError',
        param: null,
        code: String(responseStatus),
      },
      MODELSLAB
    );
  }

  if (response.status === 'processing') {
    // Generation is queued; return a processing response with the fetch URL.
    // Consumers should use webhooks or poll `response.fetch_result` for the result.
    return generateErrorResponse(
      {
        message: `Image generation is processing. Poll fetch URL: ${response.fetch_result} | ETA: ${response.eta}s`,
        type: 'ModelsLabProcessing',
        param: null,
        code: '202',
      },
      MODELSLAB
    );
  }

  if (response.status === 'success' && response.output?.length) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: response.output.map((url) => ({ url })),
      provider: MODELSLAB,
    } as ImageGenerateResponse;
  }

  return generateInvalidProviderResponseError(response, MODELSLAB);
};
