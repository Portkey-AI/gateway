import { RECRAFTAI } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateErrorResponse } from '../utils';

interface RecraftAIImageObject {
  b64_json?: string;
  url?: string;
}

interface RecraftAIImageGenerateResponse extends ImageGenerateResponse {
  data: RecraftAIImageObject[];
}

export const RecraftAIImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  style: {
    param: 'style',
    default: 'realistic_image',
  },
  style_id: {
    param: 'style_id',
  },
  n: {
    param: 'n',
    default: 1,
    min: 1,
    max: 2,
  },
  size: {
    param: 'size',
    default: '1024x1024',
  },
  response_format: {
    param: 'response_format',
    default: 'url',
  },
  controls: {
    param: 'controls',
  },
};

// const validateStyleParams = (
//   style: string | undefined,
//   style_id: string | undefined
// ) => {
//   if (style && style_id) {
//     throw new Error(
//       "Parameters 'style' and 'style_id' are mutually exclusive. Please provide only one."
//     );
//   }
// };

// const determineStyleParams = (
//   style: string | undefined,
//   style_id: string | undefined
// ): string | null => {
//   validateStyleParams(style, style_id);

//   if (!style && !style_id) {
//     return 'realistic_image';
//   }

//   if (style) {
//     return style;
//   }

//   return null;
// };

// export const generateImageRequest = (
//   prompt: string,
//   style?: string,
//   style_id?: string,
//   n: number = 1,
//   size: string = '1024x1024',
//   controls?: any
// ) => {
//   const finalStyle = determineStyleParams(style, style_id);

//   const payload = {
//     prompt,
//     style: finalStyle,
//     style_id,
//     n,
//     size,
//     controls,
//   };

//   return payload;
// };

export const RecraftAIImageGenerateResponseTransform: (
  response: RecraftAIImageGenerateResponse | ErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || 'error' in response) {
    return RecraftAIErrorResponseTransform(
      response as ErrorResponse,
      RECRAFTAI
    );
  }
  return response;
};

export const RecraftAIErrorResponseTransform: (
  response: ErrorResponse,
  provider: string
) => ErrorResponse = (response, provider) => {
  return generateErrorResponse(
    {
      message: response.error?.message || 'Unknown error occurred',
      type: response.error?.type || null,
      param: response.error?.param || null,
      code: response.error?.code || null,
    },
    provider
  );
};
