import { Params } from '../../types/requestBody';

export enum GOOGLE_GENERATE_CONTENT_FINISH_REASON {
  FINISH_REASON_UNSPECIFIED = 'FINISH_REASON_UNSPECIFIED',
  STOP = 'STOP',
  MAX_TOKENS = 'MAX_TOKENS',
  SAFETY = 'SAFETY',
  RECITATION = 'RECITATION',
  LANGUAGE = 'LANGUAGE',
  OTHER = 'OTHER',
  BLOCKLIST = 'BLOCKLIST',
  PROHIBITED_CONTENT = 'PROHIBITED_CONTENT',
  SPII = 'SPII',
  MALFORMED_FUNCTION_CALL = 'MALFORMED_FUNCTION_CALL',
  IMAGE_SAFETY = 'IMAGE_SAFETY',
}
export interface PortkeyGeminiParams extends Params {
  image_config?: {
    aspect_ratio: string; // '16:9', '4:3', '1:1'
    image_size: string; // '2K', '4K', '8K'
  };
}
