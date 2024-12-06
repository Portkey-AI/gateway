import { COHERE } from '../../globals';
import { transformStream } from '../../handlers/streamHandlerUtils';
import { ErrorResponse, UploadFileResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { CohereErrorResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

interface CohereCreateDatasetResponse {
  id: string;
}

const CohereFileUploadFieldsMapping = {
  file: 'file',
};

const CohereBatchRequestRowTransform = (row: Record<string, any>) => {
  return { text: row.body.input };
};

export const CohereUploadFileRequestTransform = (
  requestBody: ReadableStream,
  requestHeaders: Record<string, string>
) => {
  const streamTransformer = transformStream(
    requestHeaders,
    CohereFileUploadFieldsMapping,
    CohereBatchRequestRowTransform
  );
  return requestBody.pipeThrough(streamTransformer);
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
