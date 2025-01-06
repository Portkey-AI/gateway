import { COHERE } from '../../globals';
import { ErrorResponse, ListBatchesResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { CohereErrorResponse, CohereListBatchResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

export const CohereListBatchResponseTransform: (
  response: CohereListBatchResponse | CohereErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  strictOpenAiCompliance: boolean
) => ListBatchesResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  strictOpenAiCompliance
) => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }

  if ('embed_jobs' in response) {
    return {
      object: 'list',
      data: response.embed_jobs.map((job) => ({
        id: job.job_id,
        object: 'batch',
        created_at: new Date(job.created_at).getTime(),
        status: job.status,
        input_file_id: job.input_dataset_id,
        output_file_id: job.output_dataset_id,
        metadata: job.meta,
        ...(strictOpenAiCompliance
          ? { model: job.model, truncate: job.truncate, name: job.name }
          : {}),
      })),
    };
  }

  return generateInvalidProviderResponseError(response, COHERE);
};
