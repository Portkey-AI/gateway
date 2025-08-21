import { TRIPO3D } from '../../globals';
import { ProviderConfig, ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const Tripo3DGetBalanceConfig: ProviderConfig = {};

export interface Tripo3DBalance {
  balance: number;
  frozen: number;
}

export interface Tripo3DBalanceResponse {
  code: number;
  data?: Tripo3DBalance;
  message?: string;
  suggestion?: string;
}

export const Tripo3DBalanceResponseTransform: (
  response: Tripo3DBalanceResponse,
  responseStatus: number
) => Tripo3DBalanceResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || response.code !== 0) {
    return generateErrorResponse(
      {
        message: response.message || 'Failed to get balance',
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
