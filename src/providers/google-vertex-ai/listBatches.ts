import { GOOGLE_VERTEX_AI } from '../../globals';
import { generateInvalidProviderResponseError } from '../utils';
import { GoogleBatchRecord, GoogleErrorResponse } from './types';
import { GoogleToOpenAIBatch } from './utils';

type GoogleListBatchesResponse = {
  batchPredictionJobs: GoogleBatchRecord[];
  nextPageToken?: string;
};

export const GoogleListBatchesResponseTransform = (
  response: GoogleListBatchesResponse | GoogleErrorResponse,
  responseStatus: number
) => {
  if (responseStatus !== 200) {
    return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
  }

  const batches =
    (response as { batchPredictionJobs: GoogleBatchRecord[] })
      .batchPredictionJobs ?? [];

  const objects = batches.map(GoogleToOpenAIBatch);

  return {
    data: objects,
    object: 'list',
    first_id: objects.at(0)?.id,
    last_id: objects.at(-1)?.id,
    has_more: !!(response as GoogleListBatchesResponse)?.nextPageToken,
  };
};
