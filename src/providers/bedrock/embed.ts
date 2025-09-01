import { BEDROCK } from '../../globals';
import { EmbedParams, EmbedResponse } from '../../types/embedRequestBody';
import { Params } from '../../types/requestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';

export const BedrockCohereEmbedConfig: ProviderConfig = {
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
};

export const BedrockTitanEmbedConfig: ProviderConfig = {
  input: [
    {
      param: 'inputText',
      required: false,
      transform: (params: EmbedParams): string | undefined => {
        if (
          Array.isArray(params.input) &&
          typeof params.input[0] === 'object' &&
          params.input[0].text
        ) {
          return params.input[0].text;
        }
        if (typeof params.input === 'string') return params.input;
      },
    },
    {
      param: 'inputImage',
      required: false,
      transform: (params: EmbedParams) => {
        // Titan models only support one image per request
        if (
          Array.isArray(params.input) &&
          typeof params.input[0] === 'object' &&
          params.input[0].image?.base64
        ) {
          return params.input[0].image.base64;
        }
      },
    },
  ],
  dimensions: [
    {
      param: 'dimensions',
      required: false,
      transform: (params: EmbedParams): number | undefined => {
        if (typeof params.input === 'string') return params.dimensions;
      },
    },
    {
      param: 'embeddingConfig',
      required: false,
      transform: (
        params: EmbedParams
      ): { outputEmbeddingLength: number } | undefined => {
        if (Array.isArray(params.input) && params.dimensions) {
          return {
            outputEmbeddingLength: params.dimensions,
          };
        }
      },
    },
  ],
  encoding_format: {
    param: 'embeddingTypes',
    required: false,
    transform: (params: any): string[] | undefined => {
      const toTitan = (fmt: string) => (fmt === 'base64' ? 'binary' : fmt);
      if (Array.isArray(params.encoding_format))
        return params.encoding_format.map((f: string) => toTitan(f));
      else if (typeof params.encoding_format === 'string')
        return [toTitan(params.encoding_format)];
    },
  },
  // Titan specific parameters
  normalize: {
    param: 'normalize',
    required: false,
  },
};

interface BedrockTitanEmbedResponse {
  embedding?: number[];
  embeddingsByType?: { binary?: number[]; float?: number[] };
  inputTextTokenCount: number;
}

export interface BedrockErrorResponse extends ErrorResponse {
  message: string;
}

export const BedrockTitanEmbedResponseTransform: (
  response: BedrockTitanEmbedResponse | BedrockErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  strictOpenAiCompliance: boolean,
  _gatewayRequestUrl: string,
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
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  const model = (gatewayRequest.model as string) || '';
  const titanResponse = response as BedrockTitanEmbedResponse;
  if ('embedding' in titanResponse && titanResponse.embedding) {
    return {
      object: 'list',
      data: [
        {
          object: 'embedding',
          embedding: titanResponse.embedding,
          index: 0,
        },
      ],
      provider: BEDROCK,
      model,
      usage: {
        prompt_tokens: titanResponse.inputTextTokenCount,
        total_tokens: titanResponse.inputTextTokenCount,
      },
    };
  }

  if (titanResponse.embeddingsByType) {
    const embeddingVector =
      titanResponse.embeddingsByType.float ||
      titanResponse.embeddingsByType.binary;
    if (embeddingVector) {
      return {
        object: 'list',
        data: [
          {
            object: 'embedding',
            embedding: embeddingVector,
            index: 0,
          },
        ],
        provider: BEDROCK,
        model,
        usage: {
          prompt_tokens: titanResponse.inputTextTokenCount,
          total_tokens: titanResponse.inputTextTokenCount,
        },
      };
    }
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

interface BedrockCohereEmbedResponse {
  embeddings: number[][];
  id: string;
  texts: string[];
}

export const BedrockCohereEmbedResponseTransform: (
  response: BedrockCohereEmbedResponse | BedrockErrorResponse,
  responseStatus: number,
  responseHeaders: Headers,
  strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string,
  gatewayRequest: Params
) => EmbedResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders,
  _strictOpenAiCompliance,
  _gatewayRequestUrl,
  gatewayRequest
) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  const model = (gatewayRequest.model as string) || '';

  if ('embeddings' in response) {
    return {
      object: 'list',
      data: response.embeddings.map((embedding, index) => ({
        object: 'embedding',
        embedding: embedding,
        index: index,
      })),
      provider: BEDROCK,
      model,
      usage: {
        prompt_tokens:
          Number(responseHeaders.get('X-Amzn-Bedrock-Input-Token-Count')) || -1,
        total_tokens:
          Number(responseHeaders.get('X-Amzn-Bedrock-Input-Token-Count')) || -1,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
