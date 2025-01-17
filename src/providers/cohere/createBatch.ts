import { COHERE } from '../../globals';
import { CreateBatchResponse, ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { CohereCreateBatchResponse, CohereErrorResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

export const CohereCreateBatchConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  input_file_id: {
    param: 'dataset_id',
    required: true,
  },
  input_type: {
    param: 'input_type',
    required: false,
  },
  name: {
    param: 'name',
    required: false,
  },
  embedding_types: {
    param: 'embedding_types',
    required: false,
  },
  truncate: {
    param: 'truncate',
    required: false,
  },
};

export const CohereCreateBatchResponseTransform: (
  response: CohereCreateBatchResponse | CohereErrorResponse,
  responseStatus: number
) => CreateBatchResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }

  if ('job_id' in response) {
    return {
      id: response.job_id,
      object: 'batch',
      endpoint: '/v1/embed',
      status: 'in_progress',
      created_at: Math.floor(Date.now() / 1000),
      meta: response.meta,
    };
  }

  return generateInvalidProviderResponseError(response, COHERE);
};
