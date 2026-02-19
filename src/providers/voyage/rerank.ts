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
import { VOYAGE } from '../../globals';
import { VoyageRerankResponse } from './types';
import { generateOpenAICompatibleId } from '../../utils/idGenerator';

// ==================== Request Config ====================

/**
 * Voyage Rerank Request Config
 * Maps unified API params to Voyage's API format
 */
export const VoyageRerankConfig: ProviderConfig = {
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
      // Voyage accepts array of strings
      return params.documents.map((doc) =>
        typeof doc === 'string' ? doc : doc.text
      );
    },
  },
  top_n: {
    param: 'top_k', // Voyage uses top_k instead of top_n
    required: false,
  },
  // provider specific
  return_documents: {
    param: 'return_documents',
    required: false,
  },
  truncation: {
    param: 'truncation',
    required: false,
  },
};

// ==================== Response Transform ====================

/**
 * Transform Voyage rerank response to unified format
 */
export const VoyageRerankResponseTransform: (
  response: VoyageRerankResponse,
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
        message: response.detail || response.message || 'Unknown error',
        type: null,
        param: null,
        code: null,
      },
      VOYAGE
    );
  }

  if ('data' in response && response.data) {
    const results: RerankResult[] = response.data.map((item) => ({
      index: item.index,
      relevance_score: item.relevance_score,
      ...(item.document && { document: { text: item.document } }),
    }));

    return {
      object: 'list',
      id: generateOpenAICompatibleId({
        type: 'rerank',
      }),
      results,
      model: response.model || gatewayRequest.model || '',
      usage: {
        search_units: response.usage?.total_tokens,
      },
      provider: VOYAGE,
    };
  }

  return generateInvalidProviderResponseError(response, VOYAGE);
};
