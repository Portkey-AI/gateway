import { HUGGING_FACE } from '../../globals';
import { ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';
import { HuggingfaceErrorResponse } from './types';
import { HF_IMAGE_MODELS } from './constants';

export const HuggingfaceErrorResponseTransform: (
  response: HuggingfaceErrorResponse,
  responseStatus: number
) => ErrorResponse = (response, responseStatus) => {
  return generateErrorResponse(
    {
      message: response.error,
      type: null,
      param: null,
      code: responseStatus.toString(),
    },
    HUGGING_FACE
  );
};

// Utility: detect HF image models (best-effort heuristic)
// NOTE: HF does not expose model capability metadata.
export const isHFImageModel = (model: string): boolean => {
  if (!model) return false;
  return HF_IMAGE_MODELS.includes(model);
};
