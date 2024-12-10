import { COHERE } from '../../globals';
import { ErrorResponse, GetFileResponse, GetFilesResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import {
  CohereDataset,
  CohereErrorResponse,
  CohereGetFileResponse,
  CohereGetFilesResponse,
  CohereDatasetUploadStatus,
} from './types';
import { CohereErrorResponseTransform } from './utils';

const transformDatasetUploadStatus = (status: CohereDatasetUploadStatus) => {
  if (status === 'skipped' || status === 'failed') {
    return 'error';
  }
  if (status === 'validated') {
    return 'processed';
  }
  return 'uploaded';
};

const transformCohereDataset = (dataset: CohereDataset): GetFileResponse => {
  return {
    id: dataset.id,
    object: 'file',
    bytes: 0,
    created_at: new Date(dataset.created_at).getTime(),
    filename: dataset.name,
    purpose: dataset.dataset_type, // we don't have 1:1 mapping between purpose and dataset_type
    status: transformDatasetUploadStatus(dataset.validation_status),
    status_details: dataset.validation_error ?? '',
  };
};

export const CohereGetFileResponseTransform = (
  response: CohereGetFileResponse | CohereErrorResponse,
  responseStatus: number
): GetFileResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }

  if ('dataset' in response) {
    return transformCohereDataset(response.dataset);
  }

  return generateInvalidProviderResponseError(response, COHERE);
};

export const CohereGetFilesResponseTransform = (
  response: CohereGetFilesResponse | CohereErrorResponse,
  responseStatus: number
): GetFilesResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }

  if ('datasets' in response) {
    return {
      data: response.datasets.map((dataset) => transformCohereDataset(dataset)),
      object: 'list',
    };
  }

  return generateInvalidProviderResponseError(response, COHERE);
};
