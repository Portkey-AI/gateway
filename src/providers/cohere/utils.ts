import { COHERE } from '../../globals';
import { generateErrorResponse } from '../utils';
import { CohereErrorResponse } from './types';

export const CohereErrorResponseTransform = (response: CohereErrorResponse) => {
  return generateErrorResponse(
    {
      message: response.message,
      type: null,
      param: null,
      code: null,
    },
    COHERE
  );
};
