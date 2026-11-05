import { TRITON } from '../../globals';
import { ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';

interface TritonOpenAIErrorBody {
  error?: {
    message?: string;
    type?: string | null;
    param?: string | null;
    code?: string | number | null;
  };
}

interface TritonFastAPIErrorItem {
  loc?: Array<string | number>;
  msg?: string;
  message?: string;
  type?: string | null;
}

interface TritonFastAPIErrorBody {
  detail?: string | TritonFastAPIErrorItem[];
}

export const TritonOpenAIErrorResponseTransform = (
  response:
    | (TritonOpenAIErrorBody & TritonFastAPIErrorBody)
    | Record<string, any>
): ErrorResponse | undefined => {
  if (response.error?.message) {
    return generateErrorResponse(
      {
        message: response.error.message,
        type: response.error.type ?? null,
        param: response.error.param ?? null,
        code: response.error.code == null ? null : String(response.error.code),
      },
      TRITON
    );
  }

  if (typeof response.detail === 'string') {
    return generateErrorResponse(
      { message: response.detail, type: null, param: null, code: null },
      TRITON
    );
  }

  if (Array.isArray(response.detail)) {
    const [first] = response.detail;
    const location = Array.isArray(first?.loc) ? first.loc.join('.') : '';
    const detailMessage = first?.msg ?? first?.message ?? 'request failed';
    return generateErrorResponse(
      {
        message: location ? `${location}: ${detailMessage}` : detailMessage,
        type: first?.type ?? null,
        param: null,
        code: null,
      },
      TRITON
    );
  }

  return undefined;
};
