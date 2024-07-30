export enum AI21_FINISH_REASON {
  stop = 'stop',
  length = 'length',
}
export interface AI21ChatCompleteResponse {
  id: string;
  outputs: {
    text: string;
    role: string;
    finishReason: {
      reason: AI21_FINISH_REASON | string;
      length: number | null;
      sequence: string | null;
    };
  }[];
}
export interface AI21CompleteResponse {
  id: string;
  prompt: {
    text: string;
    tokens: Record<string, any>[];
  };
  completions: [
    {
      data: {
        text: string;
        tokens: Record<string, any>[];
      };
      finishReason: {
        reason: AI21_FINISH_REASON | string;
        length: number;
      };
    },
  ];
}

export interface AI21ErrorResponse {
  detail: string;
}
