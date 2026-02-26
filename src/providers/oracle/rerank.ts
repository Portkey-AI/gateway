import { ORACLE } from '../../globals';
import { Params } from '../../types/requestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

/**
 * Supported rerank models in Oracle GenAI.
 * Only Cohere rerank models are supported.
 *
 * NOTE: As of Feb 2026, rerank models are only available via DEDICATED
 * AI clusters in OCI GenAI. ON_DEMAND serving has been retired.
 * To use rerank, you need:
 * 1. A dedicated AI cluster with RERANK_COHERE shape
 * 2. Set oracleServingMode to 'DEDICATED'
 * 3. Set oracleEndpointId to your endpoint OCID
 */
export const SUPPORTED_RERANK_MODELS = [
  'cohere.rerank-v3.5',
  'cohere.rerank-multilingual-v3.1',
  'cohere.rerank-english-v3.1',
  // Add newer Cohere rerank models here as they become available
];

/**
 * Validates that the model is a supported Cohere rerank model.
 * @throws Error if model is not supported
 */
export function validateRerankModel(model: string | undefined): void {
  if (!model) {
    throw new Error('Model is required for rerank requests');
  }

  // Check if it's a Cohere model (starts with "cohere.rerank")
  if (!model.startsWith('cohere.rerank')) {
    throw new Error(
      `Unsupported rerank model: ${model}. Oracle GenAI only supports Cohere rerank models (e.g., cohere.rerank-v3.5, cohere.rerank-multilingual-v3.1)`
    );
  }
}

/**
 * Oracle GenAI Rerank Response
 */
export interface OracleRerankResponse {
  modelId: string;
  modelVersion: string;
  results: Array<{
    index: number;
    relevanceScore: number;
    document?: {
      text: string;
    };
  }>;
}

export interface OracleRerankErrorResponse {
  code: number;
  message: string;
}

/**
 * Transform standard rerank request to Oracle format
 */
export const OracleRerankConfig: ProviderConfig = {
  input: {
    param: 'input',
    required: true,
    transform: (params: Params) => {
      return (params as any).query;
    },
  },
  documents: {
    param: 'documents',
    required: true,
    transform: (params: Params) => {
      const docs = (params as any).documents;
      if (!docs) return [];
      return docs.map((doc: string | { text: string }) => {
        if (typeof doc === 'string') return doc;
        return doc.text;
      });
    },
  },
  model: [
    {
      param: 'servingMode',
      required: true,
      transform: (params: Params, providerOptions: any) => {
        // Validate that only Cohere rerank models are used
        validateRerankModel(params.model);

        const servingType = providerOptions.oracleServingMode || 'ON_DEMAND';

        // For DEDICATED mode, use endpointId instead of modelId
        if (servingType === 'DEDICATED' && providerOptions.oracleEndpointId) {
          return {
            servingType: 'DEDICATED',
            endpointId: providerOptions.oracleEndpointId,
          };
        }

        return {
          servingType,
          modelId: params.model,
        };
      },
    },
    {
      param: 'compartmentId',
      required: true,
      transform: (_: Params, providerOptions: any) => {
        return providerOptions.oracleCompartmentId;
      },
    },
  ],
  top_n: {
    param: 'topN',
  },
  return_documents: {
    param: 'isEcho',
  },
  max_chunks_per_doc: {
    param: 'maxChunksPerDocument',
  },
};

/**
 * Transform Oracle rerank response to standard format
 */
export const OracleRerankResponseTransform: (
  response: OracleRerankResponse | OracleRerankErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers
) => any | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'code' in response) {
    return generateErrorResponse(
      {
        message: response.message || 'Unknown error',
        type: response.code?.toString() || null,
        param: null,
        code: response.code?.toString() || null,
      },
      ORACLE
    );
  }

  if ('results' in response) {
    return {
      id: `rerank-${Date.now()}`,
      object: 'rerank',
      model: response.modelId,
      results: response.results.map((result) => ({
        index: result.index,
        relevance_score: result.relevanceScore,
        ...(result.document && {
          document: {
            text: result.document.text,
          },
        }),
      })),
    };
  }

  return generateInvalidProviderResponseError(response, ORACLE);
};
