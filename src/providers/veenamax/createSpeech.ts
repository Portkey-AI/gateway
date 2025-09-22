import { VEENA_MAX } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

// VeenaMAX API request interface
export interface VeenaMaxTTSRequest {
  text: string;
  speaker_id: string;
  streaming?: boolean;
  normalize?: boolean;
}

// VeenaMAX API response interface
export interface VeenaMaxTTSResponse {
  // VeenaMAX returns audio data directly as Response
}

// VeenaMAX API error response interface
export interface VeenaMaxErrorResponse {
  error: {
    message: string;
    code: number;
    type: string;
  };
}

// Parameter configuration mapping OpenAI format to VeenaMAX format
export const VeenaMaxCreateSpeechConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: false,
    default: 'veenamax-1',
  },
  input: {
    param: 'text',
    required: true,
  },
  voice: {
    param: 'speaker_id',
    required: true,
    default: 'charu_soft',
  },
  response_format: {
    param: 'response_format',
    required: false,
    default: 'wav',
  },
  speed: {
    param: 'speed',
    required: false,
    default: 1,
    min: 0.25,
    max: 4.0,
  },

  streaming: {
    param: 'streaming',
    required: false,
    default: false,
  },
  normalize: {
    param: 'normalize',
    required: false,
    default: true,
  },
};

export const VEENAMAX_VOICES = {
  charu_soft: 'charu_soft',
  keerti_joy: 'keerti_joy',
  mohini_whispers: 'mohini_whispers',
  maitri_connect: 'maitri_connect',
  soumya_calm: 'soumya_calm',
  vinaya_assist: 'vinaya_assist',
};

export const VeenaMaxCreateSpeechResponseTransform = (
  response: VeenaMaxTTSResponse | VeenaMaxErrorResponse | Response,
  responseStatus: number
) => {
  if (responseStatus !== 200) {
    if (response && typeof response === 'object' && 'error' in response) {
      const errorResponse = response as VeenaMaxErrorResponse;
      return generateErrorResponse(
        {
          message: errorResponse.error.message,
          type: errorResponse.error.type,
          param: null,
          code:
            errorResponse.error.code?.toString() || responseStatus.toString(),
        },
        VEENA_MAX
      );
    }

    let errorMessage = 'TTS request failed';
    let errorType = 'api_error';

    switch (responseStatus) {
      case 400:
        errorMessage =
          'Invalid request format. Check JSON syntax and required fields.';
        errorType = 'invalid_request_error';
        break;
      case 401:
        errorMessage =
          'Authentication failed. Verify API key and Bearer token format.';
        errorType = 'authentication_error';
        break;
      case 403:
        errorMessage = 'Access denied. Check API permissions and quotas.';
        errorType = 'permission_error';
        break;
      case 429:
        errorMessage = 'Rate limit exceeded. Implement exponential backoff.';
        errorType = 'rate_limit_error';
        break;
      case 500:
        errorMessage = 'Internal server error. Contact support if persistent.';
        errorType = 'api_error';
        break;
      default:
        errorMessage = `VeenaMAX TTS request failed with status ${responseStatus}`;
    }

    return generateErrorResponse(
      {
        message: errorMessage,
        type: errorType,
        param: null,
        code: responseStatus.toString(),
      },
      VEENA_MAX
    );
  }

  // If VeenaMAX returns a Response object (audio stream), pass it through
  // VeenaMAX returns WAV format audio data directly
  if (response instanceof Response) {
    return response;
  }

  // If somehow we get an unexpected response format
  return generateInvalidProviderResponseError(response, VEENA_MAX);
};
