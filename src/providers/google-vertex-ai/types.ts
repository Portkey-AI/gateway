export interface GoogleErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details: Array<Record<string, any>>;
  };
}

export interface GoogleGenerateFunctionCall {
  name: string;
  args: Record<string, any>;
}

export enum VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON {
  FINISH_REASON_UNSPECIFIED = 'FINISH_REASON_UNSPECIFIED',
  STOP = 'STOP',
  MAX_TOKENS = 'MAX_TOKENS',
  SAFETY = 'SAFETY',
  RECITATION = 'RECITATION',
  OTHER = 'OTHER',
  BLOCKLIST = 'BLOCKLIST',
  PROHIBITED_CONTENT = 'PROHIBITED_CONTENT',
  SPII = 'SPII',
}

export interface GoogleGenerateContentResponse {
  candidates: {
    content: {
      parts: {
        text?: string;
        functionCall?: GoogleGenerateFunctionCall;
      }[];
    };
    finishReason: VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON | string;
    index: 0;
    safetyRatings: {
      category: string;
      probability: string;
    }[];
  }[];
  promptFeedback: {
    safetyRatings: {
      category: string;
      probability: string;
      probabilityScore: number;
      severity: string;
      severityScore: number;
    }[];
  };
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}
