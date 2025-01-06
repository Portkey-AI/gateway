import { COHERE } from '../../globals';
import { getFormdataToFormdataStreamTransformer } from '../../handlers/streamHandlerUtils';
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

export const CohereBatchRequestRowTransform = (row: Record<string, any>) => {
  return {
    custom_id: row.custom_id,
    text: row.body.input,
    id: crypto.randomUUID(),
  };
};

export const CohereUploadFileRequestTransform = (
  requestBody: ReadableStream,
  requestHeaders: Record<string, string>
) => {
  const transformStream = getFormdataToFormdataStreamTransformer(
    requestHeaders,
    CohereBatchRequestRowTransform,
    CohereFileUploadFieldsMapping
  );
  return requestBody.pipeThrough(transformStream);
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
      created_at: Math.floor(Date.now() / 1000),
      filename: '',
      purpose: '',
      status: 'uploaded',
    };
  }
  return generateInvalidProviderResponseError(response, COHERE);
};
