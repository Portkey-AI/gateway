import { DeleteFileResponse, ErrorResponse } from '../types';
import { CohereErrorResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

export const CohereDeleteFileResponseTransform: (
  response: Response | CohereErrorResponse,
  responseStatus: number,
  _responseHeaders: Record<string, string>,
  _strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string
) => DeleteFileResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  _strictOpenAiCompliance,
  gatewayRequestUrl
) => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }
  const id = gatewayRequestUrl.split('/').pop() || '';
  return {
    object: 'file',
    deleted: true,
    id,
  };
};
