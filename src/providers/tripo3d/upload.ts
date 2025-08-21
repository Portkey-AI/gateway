import { TRIPO3D } from '../../globals';
import { ProviderConfig, ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const Tripo3DUploadFileConfig: ProviderConfig = {
  file: {
    param: 'file',
    required: true,
  },
};

export const Tripo3DGetStsTokenConfig: ProviderConfig = {
  format: {
    param: 'format',
    required: true,
  },
};

export interface Tripo3DUploadResponse {
  code: number;
  data?: any;
  message?: string;
  suggestion?: string;
}

export interface Tripo3DStsTokenData {
  s3_host: string;
  resource_bucket: string;
  resource_uri: string;
  session_token: string;
  sts_ak: string;
  sts_sk: string;
}

export interface Tripo3DStsTokenResponse {
  code: number;
  data?: Tripo3DStsTokenData;
  message?: string;
  suggestion?: string;
}

export const Tripo3DUploadResponseTransform: (
  response: Tripo3DUploadResponse,
  responseStatus: number
) => Tripo3DUploadResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || response.code !== 0) {
    return generateErrorResponse(
      {
        message: response.message || 'File upload failed',
        type: 'tripo3d_error',
        param: null,
        code: response.code?.toString() || 'unknown',
      },
      TRIPO3D
    );
  }

  if (response.data) {
    return {
      code: response.code,
      data: response.data,
      provider: TRIPO3D,
    };
  }

  return generateInvalidProviderResponseError(response, TRIPO3D);
};

export const Tripo3DStsTokenResponseTransform: (
  response: Tripo3DStsTokenResponse,
  responseStatus: number
) => Tripo3DStsTokenResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || response.code !== 0) {
    return generateErrorResponse(
      {
        message: response.message || 'Failed to get STS token',
        type: 'tripo3d_error',
        param: null,
        code: response.code?.toString() || 'unknown',
      },
      TRIPO3D
    );
  }

  if (response.data) {
    return {
      code: response.code,
      data: response.data,
      provider: TRIPO3D,
    };
  }

  return generateInvalidProviderResponseError(response, TRIPO3D);
};
