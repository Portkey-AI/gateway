import { ErrorResponse, ProviderConfig } from '../types';
import { EmbedResponse, EmbedResponseData } from '../../types/embedRequestBody';
import {
  VertexEmbedParams,
  GoogleErrorResponse,
  GoogleErrorResponseTransform,
  EmbedInstancesData,
  GoogleEmbedResponse,
} from './types';
import { GOOGLE_VERTEX_AI } from '../../globals';
import { generateInvalidProviderResponseError } from '../utils';

export const GoogleEmbedConfig: ProviderConfig = {
  input: {
    param: 'instances',
    required: true,
    transform: (params: VertexEmbedParams): Array<EmbedInstancesData> => {
      const instances = Array<EmbedInstancesData>();
      if (Array.isArray(params.input.instances)) {
        params.input.instances.forEach((i) => {
          instances.push(i);
        });
      } else {
        instances.push(params.input.instances);
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
        total_tokens: response.metadata.billableCharacterCount,
      },
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};
