import { TRIPO3D } from '../../globals';
import { ProviderConfig, ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const Tripo3DGetTaskConfig: ProviderConfig = {
  task_id: {
    param: 'task_id',
    required: true,
  },
};

export interface Tripo3DTaskOutput {
  model?: string;
  base_model?: string;
  pbr_model?: string;
  rendered_image?: string;
  riggable?: boolean;
  topology?: 'bip' | 'quad';
}

export interface Tripo3DTask {
  task_id: string;
  type: string;
  status:
    | 'queued'
    | 'running'
    | 'success'
    | 'failed'
    | 'cancelled'
    | 'unknown'
    | 'banned'
    | 'expired';
  input: any;
  output: Tripo3DTaskOutput;
  progress: number;
  error_code?: number;
  error_msg?: string;
  create_time: number;
  running_left_time?: number;
  queuing_num?: number;
}

export interface Tripo3DGetTaskResponse {
  code: number;
  data?: Tripo3DTask;
  message?: string;
  suggestion?: string;
}

export const Tripo3DGetTaskResponseTransform: (
  response: Tripo3DGetTaskResponse,
  responseStatus: number
) => Tripo3DGetTaskResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || response.code !== 0) {
    return generateErrorResponse(
      {
        message: response.message || 'Failed to get task status',
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
