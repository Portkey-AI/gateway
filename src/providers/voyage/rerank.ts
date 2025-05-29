import { VOYAGE } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import { RerankResponse } from '../../types/rerankResponse';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const VoyageRerankConfig: ProviderConfig = {
  query: {
    param: 'query',
    required: true,
  },
  documents: {
    param: 'documents',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
  },
  top_k: {
    param: 'top_k',
    required: false,
    default: null,
  },
  return_documents: {
    param: 'return_documents',
    default: false,
    required: false,
  },
  truncation: {
    param: 'truncation',
    default: true,
    required: false,
  },
};

export interface VoyageRerankResponse {
  object: 'list';
  data: Array<{ index: number; relevance_score: number; document: string }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

export interface VoyageValidationErrorResponse {
  detail: string;
}

export const VoyageErrorResponseTransform: (
  response: VoyageValidationErrorResponse | any
) => ErrorResponse = (response) => {
  let errorField: string | null = null;

  let errorMessage = response.detail;
  let errorType = 'Invalid Request';

  return generateErrorResponse(
    {
      message: `${errorField ? `${errorField}: ` : ''}${errorMessage}`,
      type: errorType,
      param: null,
      code: null,
    },
    VOYAGE
  );
};

export const VoyageRerankResponseTransform: (
  response: VoyageRerankResponse | VoyageValidationErrorResponse | any,
  responseStatus: number
) => RerankResponse | ErrorResponse = (response, responseStatus) => {
  if ('detail' in response && responseStatus !== 200) {
    return VoyageErrorResponseTransform(response);
  }

  if ('data' in response) {
    return {
      object: 'list',
      data: response.data,
      model: response.model,
      usage: {
        prompt_tokens: response.usage.total_tokens,
        total_tokens: response.usage.total_tokens,
      },
      provider: VOYAGE,
    };
  }

  return generateInvalidProviderResponseError(response, VOYAGE);
};
