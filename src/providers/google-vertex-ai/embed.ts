import { ErrorResponse, ProviderConfig } from '../types';
import {
  EmbedResponse,
  EmbedResponseData,
  EmbedParams,
} from '../../types/embedRequestBody';
import { GoogleErrorResponse, GoogleEmbedResponse } from './types';
import { GOOGLE_VERTEX_AI } from '../../globals';
import { generateInvalidProviderResponseError } from '../utils';
import { GoogleErrorResponseTransform } from './utils';
import {
  transformEmbeddingInputs,
  transformEmbeddingsParameters,
} from './transformGenerationConfig';
import { Params } from '../../types/requestBody';

enum TASK_TYPE {
  RETRIEVAL_QUERY = 'RETRIEVAL_QUERY',
  RETRIEVAL_DOCUMENT = 'RETRIEVAL_DOCUMENT',
  SEMANTIC_SIMILARITY = 'SEMANTIC_SIMILARITY',
  CLASSIFICATION = 'CLASSIFICATION',
  CLUSTERING = 'CLUSTERING',
  QUESTION_ANSWERING = 'QUESTION_ANSWERING',
  FACT_VERIFICATION = 'FACT_VERIFICATION',
  CODE_RETRIEVAL_QUERY = 'CODE_RETRIEVAL_QUERY',
}

export interface GoogleEmbedParams extends EmbedParams {
  task_type: TASK_TYPE | string;
  parameters?: {
    outputDimensionality: number;
  };
}

export const GoogleEmbedConfig: ProviderConfig = {
  input: {
    param: 'instances',
    required: true,
    transform: (params: GoogleEmbedParams) => transformEmbeddingInputs(params),
  },
  parameters: {
    param: 'parameters',
    required: false,
  },
  dimensions: {
    param: 'parameters',
    required: false,
    transform: (params: GoogleEmbedParams) =>
      transformEmbeddingsParameters(params),
  },
};

export const VertexBatchEmbedConfig: ProviderConfig = {
  input: {
    param: 'content',
    required: true,
    transform: (value: EmbedParams) => {
      if (typeof value.input === 'string') {
        return value.input;
      }
      return value.input.map((item) => item).join('\n');
    },
  },
};

export const GoogleEmbedResponseTransform: (
  response: GoogleEmbedResponse | GoogleErrorResponse,
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
    const errorResposne = GoogleErrorResponseTransform(
      response as GoogleErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  const model = (gatewayRequest.model as string) || '';

  if ('predictions' in response) {
    const data: EmbedResponseData[] = [];
    let tokenCount = 0;
    response.predictions.forEach((prediction, index) => {
      const item = {
        object: 'embedding',
        index: index,
        ...(prediction.imageEmbedding && {
          image_embedding: prediction.imageEmbedding,
        }),
        ...(prediction.videoEmbeddings && {
          video_embeddings: prediction.videoEmbeddings.map(
            (videoEmbedding, idx) => ({
              object: 'embedding',
              embedding: videoEmbedding.embedding,
              index: idx,
              start_offset: videoEmbedding.startOffsetSec,
              end_offset: videoEmbedding.endOffsetSec,
            })
          ),
        }),
        ...(prediction.textEmbedding && {
          embedding: prediction.textEmbedding,
        }),
        ...(prediction.embeddings && {
          embedding: prediction.embeddings.values,
        }),
      };
      tokenCount += prediction?.embeddings?.statistics?.token_count || 0;
      data.push(item);
    });
    data.forEach((item, index) => {
      item.index = index;
    });
    return {
      object: 'list',
      data: data,
      model,
      usage: {
        prompt_tokens: tokenCount,
        total_tokens: tokenCount,
      },
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};
