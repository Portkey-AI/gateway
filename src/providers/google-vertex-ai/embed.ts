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
import { transformEmbeddingInputs } from './transformGenerationConfig';

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
}

export const GoogleEmbedConfig: ProviderConfig = {
  input: {
    param: 'instances',
    required: true,
    transform: (params: GoogleEmbedParams) => transformEmbeddingInputs(params),
  },
  inputs: {
    param: 'instances',
    required: false,
    transform: (params: GoogleEmbedParams) => transformEmbeddingInputs(params),
  },
  parameters: {
    param: 'parameters',
    required: false,
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
      if (prediction.imageEmbedding) {
        data.push({
          object: 'embedding',
          embedding: prediction.imageEmbedding,
          type: 'image',
          index: index,
        });
      }
      if (prediction.textEmbedding) {
        data.push({
          object: 'embedding',
          embedding: prediction.textEmbedding,
          type: 'text',
          index: index,
        });
      }
      if (prediction.videoEmbeddings) {
        prediction.videoEmbeddings.forEach((videoEmbedding) => {
          data.push({
            object: 'embedding',
            embedding: videoEmbedding.embedding,
            type: 'video',
            index: index,
            start_offset: videoEmbedding.startOffsetSec,
            end_offset: videoEmbedding.endOffsetSec,
          });
        });
      }
      if (prediction.embeddings) {
        data.push({
          object: 'embedding',
          embedding: prediction.embeddings.values,
          index: index,
        });
      }
      data.forEach((item, index) => {
        item.index = index;
      });
      tokenCount += prediction?.embeddings?.statistics?.token_count || 0;
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
