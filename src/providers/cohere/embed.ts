import { ErrorResponse, ProviderConfig } from '../types';
import { EmbedParams, EmbedResponse } from '../../types/embedRequestBody';
import { generateErrorResponse } from '../utils';
import { COHERE } from '../../globals';

export const CohereEmbedConfig: ProviderConfig = {
  input: [
    {
      param: 'texts',
      required: false,
      transform: (params: EmbedParams): string[] | undefined => {
        if (typeof params.input === 'string') return [params.input];
        else if (Array.isArray(params.input) && params.input.length > 0) {
          const texts: string[] = [];
          params.input.forEach((item) => {
            if (typeof item === 'string') {
              texts.push(item);
            } else if (item.text) {
              texts.push(item.text);
            }
          });
          return texts.length > 0 ? texts : undefined;
        }
      },
    },
    {
      param: 'images',
      required: false,
      transform: (params: EmbedParams): string[] | undefined => {
        if (Array.isArray(params.input) && params.input.length > 0) {
          const images: string[] = [];
          params.input.forEach((item) => {
            if (typeof item === 'object' && item.image?.base64) {
              images.push(item.image.base64);
            }
          });
          return images.length > 0 ? images : undefined;
        }
      },
    },
  ],
  input_type: {
    param: 'input_type',
    required: true,
  },
  truncate: {
    param: 'truncate',
    required: false,
  },
  encoding_format: {
    param: 'embedding_types',
    required: false,
    transform: (params: any): string[] | undefined => {
      if (Array.isArray(params.encoding_format)) return params.encoding_format;
      else if (typeof params.encoding_format === 'string')
        return [params.encoding_format];
    },
  },
  //backwards compatibility
  embedding_types: {
    param: 'embedding_types',
    required: false,
  },
};

/**
 * The version of the API used for the Cohere Embedding request.
 * @interface
 */
export interface ApiVersion {
  /** The version number. */
  version: string;
}

/**
 * Metadata about the embedding response.
 * @interface
 */
export interface EmbedMeta {
  /** The API version used. */
  api_version: ApiVersion;
}

/**
 * The structure of the CohereEmbedResponse.
 * @interface
 */
export interface CohereEmbedResponse {
  /** A string that represents the ID of the embedding request. */
  id: string;

  /** An array of strings which were the input texts to be embedded. */
  texts: string[];

  /** A 2D array of floating point numbers representing the embeddings. */
  embeddings: number[][];

  /** An `EmbedMeta` object which contains metadata about the response. */
  meta: EmbedMeta;

  message?: string;
}

export const CohereEmbedResponseTransform: (
  response: CohereEmbedResponse,
  responseStatus: number,
  responseHeaders: Headers,
  strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string,
  gatewayRequest: Params
) => EmbedResponse | ErrorResponse = (
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
        message: response.message || '',
        type: null,
        param: null,
        code: null,
      },
      COHERE
    );
  }

  return {
    object: 'list',
    data: response.embeddings.map((embedding, index) => ({
      object: 'embedding',
      embedding: embedding,
      index: index,
    })),
    model: (gatewayRequest.model as string) || '',
    usage: {
      prompt_tokens: -1,
      total_tokens: -1,
    },
  };
};

interface CohereEmbedResponseBatch {
  custom_id: string;
  id: string;
  text: string;
  embeddings: {
    float?: {
      array: number[];
    };
    int8?: {
      array: number[];
    };
    uint8?: {
      array: number[];
    };
    binary?: {
      array: number[];
    };
    ubinary?: {
      array: number[];
    };
  };
}

export const CohereEmbedResponseTransformBatch = (
  response: CohereEmbedResponseBatch
) => {
  return {
    id: response.id,
    custom_id: response.custom_id,
    response: {
      status_code: 200,
      request_id: response.id,
      body: {
        object: 'list',
        data: [
          {
            object: 'embedding',
            index: 0,
            embedding: response.embeddings.float?.array,
          },
        ],
        model: '',
        usage: {
          prompt_tokens: 0,
          total_tokens: 0,
        },
      },
    },
  };
};
