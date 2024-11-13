import { COHERE } from '../../globals';
import { ErrorResponse, UploadFileResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { CohereErrorResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

interface CohereCreateDatasetResponse {
  id: string;
}

export const CohereUploadFileRequestTransform = (requestBody: FormData) => {
  const transformedRequestBody = new FormData();
  const file = requestBody.get('file');
  if (file) {
    transformedRequestBody.set('file', file);
  }
  return transformedRequestBody;
};

export const CohereUploadFileResponseTransform: (
  response: CohereCreateDatasetResponse | CohereErrorResponse,
  responseStatus: number
) => UploadFileResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  } else if ('id' in response) {
    return {
      id: response.id,
      object: 'file',
      bytes: 0,
      created_at: Math.floor(Date.now() / 1000),
      filename: '',
      purpose: '',
    };
  }
  return generateInvalidProviderResponseError(response, COHERE);
};
