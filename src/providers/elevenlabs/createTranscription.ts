import { ELEVENLABS } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';

export const ElevenLabsCreateTranscriptionConfig: ProviderConfig = {
  file: {
    param: 'file',
    required: true,
  },
  model_id: {
    param: 'model_id',
    required: false,
    default: 'scribe_v1',
  },
  language: {
    param: 'language',
    required: false,
  },
};

export const ElevenLabsCreateTranscriptionResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return {
      error: {
        message: response.error?.message || 'ElevenLabs API error',
        type: response.error?.type || 'api_error',
        param: null,
        code: null,
      },
      provider: ELEVENLABS,
    };
  }

  return response;
};
