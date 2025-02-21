// GoogleToOpenAIBatch

import { GoogleBatchRecord } from './types';
import { GoogleToOpenAIBatch } from './utils';

export const GoogleRetrieveBatchResponseTransform = (
  response: GoogleBatchRecord,
  status: number
) => {
  if (status !== 200) {
    return response;
  }

  return GoogleToOpenAIBatch(response);
};
