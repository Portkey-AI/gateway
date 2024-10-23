import { ErrorResponse, ProviderConfig } from '../types';
import {
  EmbedResponse,
  EmbedResponseData,
  EmbedParams,
} from '../../types/embedRequestBody';
import {
  GoogleErrorResponse,
  EmbedInstancesData,
  GoogleEmbedResponse,
} from './types';
import { GOOGLE_VERTEX_AI } from '../../globals';
import { generateInvalidProviderResponseError } from '../utils';
import { GoogleErrorResponseTransform } from './utils';

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

interface GoogleEmbedParams extends EmbedParams {
  task_type: TASK_TYPE | string;
}

export const GoogleEmbedConfig: ProviderConfig = {
  input: {
    param: 'instances',
    required: true,
    transform: (params: GoogleEmbedParams): Array<EmbedInstancesData> => {
      const instances = Array<EmbedInstancesData>();
      if (Array.isArray(params.input)) {
        params.input.forEach((text) => {
          instances.push({
            content: text,
            task_type: params.task_type,
          });
        });
      } else {
        instances.push({
          content: params.input,
          task_type: params.task_type,
        });
      }
      return instances;
    },
  },
  parameters: {
    param: 'parameters',
    required: false,
  },
};

export const GoogleEmbedResponseTransform: (
  response: GoogleEmbedResponse | GoogleErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResposne = GoogleErrorResponseTransform(
      response as GoogleErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('predictions' in response) {
    const data: EmbedResponseData[] = [];
    let tokenCount = 0;
    response.predictions.forEach((prediction, index) => {
      data.push({
        object: 'embedding',
        embedding: prediction.embeddings.values,
        index: index,
      });
      tokenCount += prediction.embeddings.statistics.token_count;
    });
    return {
      object: 'list',
      data: data,
      model: '', // Todo: find a way to send the google embedding model name back
      usage: {
        prompt_tokens: tokenCount,
        total_tokens: tokenCount,
      },
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};
