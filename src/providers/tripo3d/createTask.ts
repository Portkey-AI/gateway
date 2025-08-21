import { TRIPO3D } from '../../globals';
import { Params } from '../../types/requestBody';
import { ProviderConfig, ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const Tripo3DCreateTaskConfig: ProviderConfig = {
  type: {
    param: 'type',
    required: true,
  },
  prompt: {
    param: 'prompt',
    required: false,
  },
  negative_prompt: {
    param: 'negative_prompt',
    required: false,
  },
  text_seed: {
    param: 'text_seed',
    required: false,
  },
  model_seed: {
    param: 'model_seed',
    required: false,
  },
  texture_seed: {
    param: 'texture_seed',
    required: false,
  },
  style: {
    param: 'style',
    required: false,
  },
  model_version: {
    param: 'model_version',
    required: false,
  },
  face_limit: {
    param: 'face_limit',
    required: false,
  },
  auto_size: {
    param: 'auto_size',
    required: false,
    default: false,
  },
  quad: {
    param: 'quad',
    required: false,
    default: false,
  },
  texture: {
    param: 'texture',
    required: false,
    default: true,
  },
  pbr: {
    param: 'pbr',
    required: false,
    default: true,
  },
  texture_quality: {
    param: 'texture_quality',
    required: false,
    default: 'standard',
  },
  texture_alignment: {
    param: 'texture_alignment',
    required: false,
    default: 'original_image',
  },
  file: {
    param: 'file',
    required: false,
  },
  files: {
    param: 'files',
    required: false,
  },
  mode: {
    param: 'mode',
    required: false,
  },
  orthographic_projection: {
    param: 'orthographic_projection',
    required: false,
    default: false,
  },
  orientation: {
    param: 'orientation',
    required: false,
    default: 'default',
  },
  smart_low_poly: {
    param: 'smart_low_poly',
    required: false,
    default: false,
  },
  generate_parts: {
    param: 'generate_parts',
    required: false,
    default: false,
  },
  original_model_task_id: {
    param: 'original_model_task_id',
    required: false,
  },
  draft_model_task_id: {
    param: 'draft_model_task_id',
    required: false,
  },
  format: {
    param: 'format',
    required: false,
  },
  out_format: {
    param: 'out_format',
    required: false,
    default: 'glb',
  },
  topology: {
    param: 'topology',
    required: false,
  },
  spec: {
    param: 'spec',
    required: false,
    default: 'tripo',
  },
  animation: {
    param: 'animation',
    required: false,
  },
  animations: {
    param: 'animations',
    required: false,
  },
  bake_animation: {
    param: 'bake_animation',
    required: false,
    default: true,
  },
  export_with_geometry: {
    param: 'export_with_geometry',
    required: false,
    default: true,
  },
  block_size: {
    param: 'block_size',
    required: false,
    default: 80,
  },
  force_symmetry: {
    param: 'force_symmetry',
    required: false,
    default: false,
  },
  flatten_bottom: {
    param: 'flatten_bottom',
    required: false,
    default: false,
  },
  flatten_bottom_threshold: {
    param: 'flatten_bottom_threshold',
    required: false,
    default: 0.01,
  },
  texture_size: {
    param: 'texture_size',
    required: false,
    default: 4096,
  },
  texture_format: {
    param: 'texture_format',
    required: false,
    default: 'JPEG',
  },
  pivot_to_center_bottom: {
    param: 'pivot_to_center_bottom',
    required: false,
    default: false,
  },
  with_animation: {
    param: 'with_animation',
    required: false,
    default: false,
  },
  pack_uv: {
    param: 'pack_uv',
    required: false,
    default: false,
  },
  bake: {
    param: 'bake',
    required: false,
    default: false,
  },
  part_names: {
    param: 'part_names',
    required: false,
  },
  compress: {
    param: 'compress',
    required: false,
    default: '',
  },
  texture_prompt: {
    param: 'texture_prompt',
    required: false,
  },
};

export interface Tripo3DCreateTaskResponse {
  code: number;
  data?: {
    task_id: string;
  };
  message?: string;
  suggestion?: string;
}

export const Tripo3DCreateTaskResponseTransform: (
  response: Tripo3DCreateTaskResponse,
  responseStatus: number
) => Tripo3DCreateTaskResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || response.code !== 0) {
    return generateErrorResponse(
      {
        message: response.message || 'Task creation failed',
        type: 'tripo3d_error',
        param: null,
        code: response.code?.toString() || 'unknown',
      },
      TRIPO3D
    );
  }

  if (response.data?.task_id) {
    return {
      code: response.code,
      data: response.data,
      provider: TRIPO3D,
    };
  }

  return generateInvalidProviderResponseError(response, TRIPO3D);
};
