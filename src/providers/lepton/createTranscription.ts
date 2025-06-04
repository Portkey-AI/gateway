import { LEPTON } from '../../globals';
import { ErrorResponse } from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';

export const LeptonCreateTranscriptionResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, LEPTON);
  }

  Object.defineProperty(response, 'provider', {
    value: LEPTON,
    enumerable: true,
  });

  return response;
};
