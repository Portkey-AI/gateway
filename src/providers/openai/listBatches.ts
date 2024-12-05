import { OPEN_AI } from '../../globals';
import { ErrorResponse, ListBatchesResponse, ProviderConfig } from '../types';
import { OpenAIErrorResponseTransform } from './utils';

export const OpenAIListBatchesResponseTransform: (
  response: ListBatchesResponse | ErrorResponse,
  responseStatus: number
) => ListBatchesResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};
