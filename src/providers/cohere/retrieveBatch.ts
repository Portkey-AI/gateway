import { COHERE } from '../../globals';
import { ErrorResponse, RetrieveBatchResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { CohereErrorResponse, CohereRetrieveBatchResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

export const CohereRetrieveBatchResponseTransform: (
  response: CohereRetrieveBatchResponse | CohereErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  strictOpenAiCompliance: boolean
) => RetrieveBatchResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  strictOpenAiCompliance
) => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }

  if ('job_id' in response) {
    return {
      id: response.job_id,
      object: 'batch',
      created_at: new Date(response.created_at).getTime(),
      status: response.status,
      input_file_id: response.input_dataset_id,
      output_file_id: response.output_dataset_id,
      metadata: response.meta,
      ...(strictOpenAiCompliance
        ? {
            model: response.model,
            truncate: response.truncate,
            name: response.name,
          }
        : {}),
    };
  }

  return generateInvalidProviderResponseError(response, COHERE);
};
