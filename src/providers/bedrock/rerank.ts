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
import { BEDROCK } from '../../globals';
import {
  BedrockRerankResponse,
  BedrockRerankQuery,
  BedrockRerankSource,
  BedrockRerankingConfiguration,
} from './types';
import { generateOpenAICompatibleId } from '../../utils/idGenerator';

// ==================== Request Config ====================

/**
 * Bedrock Rerank Request Config
 * Maps unified API params to Bedrock's API format
 * Bedrock uses a more complex nested structure
 */
export const BedrockRerankConfig: ProviderConfig = {
  model: {
    param: 'rerankingConfiguration',
    required: true,
    transform: (params: RerankParams): BedrockRerankingConfiguration => ({
      type: 'BEDROCK_RERANKING_MODEL',
      bedrockRerankingConfiguration: {
        modelConfiguration: {
          modelArn: params.model,
        },
        ...(params.top_n && { numberOfResults: params.top_n }),
      },
    }),
  },
  query: {
    param: 'queries',
    required: true,
    transform: (params: RerankParams): BedrockRerankQuery[] => [
      {
        type: 'TEXT',
        textQuery: {
          text: params.query,
        },
      },
    ],
  },
  documents: {
    param: 'sources',
    required: true,
    transform: (params: RerankParams): BedrockRerankSource[] =>
      params.documents.map((doc) => ({
        type: 'INLINE',
        inlineDocumentSource: {
          type: 'TEXT',
          textDocument: {
            text: typeof doc === 'string' ? doc : doc.text,
          },
        },
      })),
  },
};

// ==================== Response Transform ====================

/**
 * Transform Bedrock rerank response to unified format
 */
export const BedrockRerankResponseTransform: (
  response: BedrockRerankResponse,
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
      BEDROCK
    );
  }

  if ('results' in response && response.results) {
    const results: RerankResult[] = response.results.map((result) => ({
      index: result.index,
      relevance_score: result.relevanceScore,
      ...(result.document?.textDocument && {
        document: { text: result.document.textDocument.text },
      }),
    }));

    return {
      id: generateOpenAICompatibleId({
        type: 'rerank',
      }),
      object: 'list',
      results,
      model: gatewayRequest.model || '',
      provider: BEDROCK,
      usage: {
        search_units: Math.ceil(gatewayRequest.documents.length / 100),
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
