import { DEEPGRAM } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';

export const DeepgramCreateSpeechConfig: ProviderConfig = {
  text: {
    param: 'text',
    required: true,
  },
  // model is handled as a query param in api.ts, not in body
};

export const DeepgramCreateSpeechResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return {
      error: {
        message: response.error?.message || 'Deepgram API error',
        type: response.error?.type || 'api_error',
        param: null,
        code: null,
      },
      provider: DEEPGRAM,
    };
  }

  return response;
};
