import { MESHY } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';

export const MeshyModelGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  negative_prompt: {
    param: 'negative_prompt',
  },
  art_style: {
    param: 'art_style',
  },
  mode: {
    param: 'mode',
    default: 'preview',
  },
  seed: {
    param: 'seed',
  },
};

interface MeshyModelGenerateResponse {
  result: string;
  id?: string;
  status?: string;
  created_at?: string;
  expires_at?: string;
}

export const MeshyModelGenerateResponseTransform: (
  response: MeshyModelGenerateResponse | ErrorResponse,
  responseStatus: number
) => MeshyModelGenerateResponse | ErrorResponse = (
  response,
  responseStatus
) => {
  if (responseStatus !== 200) {
    return generateInvalidProviderResponseError(response, MESHY);
  }

  if ('result' in response) {
    return {
      result: response.result,
      id: response.id,
      status: response.status,
      created_at: response.created_at,
      expires_at: response.expires_at,
    };
  }

  return generateInvalidProviderResponseError(response, MESHY);
};
