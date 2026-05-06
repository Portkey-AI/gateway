import { ORACLE } from '../../globals';
import {
  EmbedParams,
  EmbedResponse,
  EmbedResponseData,
} from '../../types/embedRequestBody';
import { Options } from '../../types/requestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

type OracleInputType =
  | 'SEARCH_DOCUMENT'
  | 'SEARCH_QUERY'
  | 'CLASSIFICATION'
  | 'CLUSTERING'
  | 'IMAGE';

type OracleTruncate = 'NONE' | 'START' | 'END';

export const OracleEmbedConfig: ProviderConfig = {
  input: {
    param: 'inputs',
    required: true,
    transform: (params: EmbedParams): string[] | undefined => {
      if (typeof params.input === 'string') {
        return [params.input];
      }
      if (Array.isArray(params.input)) {
        const texts: string[] = [];
        params.input.forEach((item) => {
          if (typeof item === 'string') {
            texts.push(item);
          } else if (typeof item === 'object' && 'text' in item) {
            texts.push((item as { text: string }).text);
          }
        });
        return texts.length > 0 ? texts : undefined;
      }
      return undefined;
    },
  },
  input_type: {
    param: 'inputType',
    required: false,
    transform: (params: EmbedParams): OracleInputType | undefined => {
      const typeMap: Record<string, OracleInputType> = {
        search_document: 'SEARCH_DOCUMENT',
        search_query: 'SEARCH_QUERY',
        classification: 'CLASSIFICATION',
        clustering: 'CLUSTERING',
        image: 'IMAGE',
      };
      const inputType = (params as any).input_type;
      if (inputType && typeMap[inputType.toLowerCase()]) {
        return typeMap[inputType.toLowerCase()];
      }
      return undefined;
    },
  },
  truncate: {
    param: 'truncate',
    required: false,
    transform: (params: EmbedParams): OracleTruncate | undefined => {
      const truncateMap: Record<string, OracleTruncate> = {
        none: 'NONE',
        start: 'START',
        end: 'END',
      };
      const truncate = (params as any).truncate;
      if (truncate && truncateMap[truncate.toLowerCase()]) {
        return truncateMap[truncate.toLowerCase()];
      }
      return undefined;
    },
  },
  is_echo: {
    param: 'isEcho',
    required: false,
    transform: (params: EmbedParams): boolean | undefined => {
      return (params as any).is_echo;
    },
  },
  model: {
    param: 'servingMode',
    required: true,
    transform: (params: EmbedParams): object => {
      return {
        servingType: 'ON_DEMAND',
        modelId: params.model,
      };
    },
  },
  compartmentId: {
    param: 'compartmentId',
    required: true,
    default: (_params: EmbedParams, provider: Options): string => {
      return provider.oracleCompartmentId || '';
    },
  },
};

export interface OracleEmbedResponse {
  embeddings: number[][];
  modelId: string;
  modelVersion: string;
  inputTextTokenCount?: number;
}

export interface OracleEmbedErrorResponse {
  code: string;
  message: string;
}

export const OracleEmbedResponseTransform = (
  response: OracleEmbedResponse | OracleEmbedErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers
): EmbedResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'code' in response) {
    return generateErrorResponse(
      {
        message: `oracle error: ${response.message || 'Unknown error'}`,
        type: response.code?.toString() || null,
        param: null,
        code: response.code?.toString() || null,
      },
      ORACLE
    );
  }

  const successResponse = response as OracleEmbedResponse;
  if (
    !successResponse.embeddings ||
    !Array.isArray(successResponse.embeddings)
  ) {
    return generateInvalidProviderResponseError(response, ORACLE);
  }

  const data: EmbedResponseData[] = successResponse.embeddings.map(
    (embedding, index) => ({
      object: 'embedding' as const,
      embedding,
      index,
    })
  );

  return {
    object: 'list',
    data,
    model: successResponse.modelId,
    usage: {
      prompt_tokens: successResponse.inputTextTokenCount || 0,
      total_tokens: successResponse.inputTextTokenCount || 0,
    },
    provider: ORACLE,
  };
};
