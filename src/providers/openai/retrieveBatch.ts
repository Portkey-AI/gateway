import { OPEN_AI } from '../../globals';
import { ErrorResponse, ProviderConfig, RetrieveBatchResponse } from '../types';
import { OpenAIErrorResponseTransform } from './utils';

export const OpenAIRetrieveBatchResponseTransform: (
  response: RetrieveBatchResponse | ErrorResponse,
  responseStatus: number
) => RetrieveBatchResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};
