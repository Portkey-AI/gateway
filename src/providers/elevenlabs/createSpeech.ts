import { ELEVENLABS } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';

export const ElevenLabsCreateSpeechConfig: ProviderConfig = {
  text: {
    param: 'text',
    required: true,
  },
  model_id: {
    param: 'model_id',
    required: false,
    default: 'eleven_multilingual_v2',
  },
  voice_settings: {
    param: 'voice_settings',
    required: false,
  },
  output_format: {
    param: 'output_format',
    required: false,
  },
  // Note: voice_id is extracted and used in the URL path, not sent in body
};

export const ElevenLabsCreateSpeechResponseTransform: (
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
