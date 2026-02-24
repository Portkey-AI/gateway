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
import { JINA } from '../../globals';
import { JinaRerankResponse } from './types';
import { generateOpenAICompatibleId } from '../../utils/idGenerator';

// ==================== Request Config ====================

/**
 * Jina Rerank Request Config
 * Maps unified API params to Jina's API format
 */
export const JinaRerankConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'jina-reranker-v2-base-multilingual',
  },
  query: {
    param: 'query',
    required: true,
  },
  documents: {
    param: 'documents',
    required: true,
    transform: (params: RerankParams): string[] => {
      // Jina accepts array of strings
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
  return_documents: {
    param: 'return_documents',
    required: false,
  },
};

// ==================== Response Transform ====================

/**
 * Transform Jina rerank response to unified format
 */
export const JinaRerankResponseTransform: (
  response: JinaRerankResponse,
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
      JINA
    );
  }

  if ('results' in response && response.results) {
    const results: RerankResult[] = response.results.map((result) => ({
      index: result.index,
      relevance_score: result.relevance_score,
      ...(result.document && { document: { text: result.document.text } }),
    }));

    return {
      object: 'list',
      id: generateOpenAICompatibleId({ type: 'rerank' }),
      results,
      model: response.model || gatewayRequest.model || '',
      usage: {
        search_units: response.usage?.total_tokens,
      },
      provider: JINA,
    };
  }

  return generateInvalidProviderResponseError(response, JINA);
};
