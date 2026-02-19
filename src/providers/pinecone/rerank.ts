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
import { PINECONE } from '../../globals';
import { PineconeRerankResponse, PineconeRerankDocument } from './types';

// ==================== Request Config ====================

/**
 * Pinecone Rerank Request Config
 * Maps unified API params to Pinecone's API format
 */
export const PineconeRerankConfig: ProviderConfig = {
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
    transform: (params: RerankParams): PineconeRerankDocument[] => {
      // Pinecone requires array of objects with id and text fields
      return params.documents.map((doc, index) => {
        if (typeof doc === 'string') {
          return { id: `doc_${index}`, text: doc };
        }
        // If document is an object, ensure it has an id field
        const docObj = doc as any;
        return {
          id: docObj.id || `doc_${index}`,
          text: docObj.text,
          ...docObj,
        };
      });
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
  rank_fields: {
    param: 'rank_fields',
    required: false,
  },
  parameters: {
    param: 'parameters',
    required: false,
  },
};

// ==================== Response Transform ====================

/**
 * Transform Pinecone rerank response to unified format
 */
export const PineconeRerankResponseTransform: (
  response: PineconeRerankResponse,
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
        message: response.error?.message || response.message || 'Unknown error',
        type: null,
        param: null,
        code: response.error?.code || null,
      },
      PINECONE
    );
  }

  if ('data' in response && response.data) {
    const results: RerankResult[] = response.data.map((item) => ({
      index: item.index,
      relevance_score: item.score,
      ...(item.document && { document: item.document }),
    }));

    return {
      object: 'list',
      results,
      model: response.model || gatewayRequest.model || '',
      usage: {
        search_units: response.usage?.rerank_units,
      },
      provider: PINECONE,
    };
  }

  return generateInvalidProviderResponseError(response, PINECONE);
};
