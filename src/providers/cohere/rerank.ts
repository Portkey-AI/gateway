import { ErrorResponse, ProviderConfig } from '../types';
import {
  RerankParams,
  RerankResponse,
  RerankResult,
} from '../../types/rerankRequestBody';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { COHERE } from '../../globals';
import { CohereRerankResponse } from './types';

// ==================== Request Config ====================

/**
 * Cohere Rerank Request Config
 * Maps unified API params to Cohere's API format
 */
export const CohereRerankConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  query: {
    param: 'query',
    required: true,
  },
  documents: {
    param: 'documents',
    required: true,
    transform: (params: RerankParams): string[] => {
      // Cohere accepts array of strings only
      return params.documents.map((doc) =>
        typeof doc === 'string' ? doc : doc.text
      );
    },
  },
  top_n: {
    param: 'top_n',
    required: false,
  },
  // provider specific
  max_tokens_per_doc: {
    param: 'max_tokens_per_doc',
    required: false,
  },
  priority: {
    param: 'priority',
    required: false,
  },
};

// ==================== Response Transform ====================

/**
 * Transform Cohere rerank response to unified format
 */
export const CohereRerankResponseTransform: (
  response: CohereRerankResponse,
  responseStatus: number,
  responseHeaders: Headers,
  strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string,
  gatewayRequest: RerankParams
) => RerankResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  _strictOpenAiCompliance,
  _gatewayRequestUrl,
  gatewayRequest
) => {
  if (responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message || 'Unknown error',
        type: null,
        param: null,
        code: null,
      },
      COHERE
    );
  }

  if ('results' in response) {
    const results: RerankResult[] = response.results.map((result) => ({
      index: result.index,
      relevance_score: result.relevance_score,
    }));

    return {
      object: 'list',
      id: response.id,
      results,
      model: gatewayRequest.model || '',
      usage: {
        search_units: response.meta?.billed_units?.search_units,
      },
      provider: COHERE,
    };
  }

  return generateInvalidProviderResponseError(response, COHERE);
};
