import { GOOGLE_VERTEX_AI } from '../../globals';
import { ChatCompletionResponse, ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';

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

export interface GoogleGenerateContentResponse {
  candidates: {
    content: {
      parts: {
        text?: string;
        functionCall?: GoogleGenerateFunctionCall;
      }[];
    };
    finishReason: string;
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

export interface VertexLLamaChatCompleteResponse
  extends Omit<ChatCompletionResponse, 'id' | 'created'> {}

export interface VertexLlamaChatCompleteStreamChunk {
  choices: {
    delta: {
      content: string;
      role: string;
    };
    finish_reason?: string;
    index: 0;
  }[];
  model: string;
  object: string;
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
  id?: string;
  created?: number;
  provider?: string;
}

export const GoogleErrorResponseTransform: (
  response: GoogleErrorResponse,
  provider?: string
) => ErrorResponse | undefined = (response, provider = GOOGLE_VERTEX_AI) => {
  if ('error' in response) {
    return generateErrorResponse(
      {
        message: response.error.message ?? '',
        type: response.error.status ?? null,
        param: null,
        code: response.error.status ?? null,
      },
      provider
    );
  }

  return undefined;
};

export interface EmbedInstancesData {
  task_type: string;
  content: string;
}

export interface VertexEmbedParams {
  model: string; // The model name to be used as the embedding model
  input: { instances: EmbedInstancesData }; // The instances to be embedded with the task type
}

interface EmbedPredictionsResponse {
  embeddings: {
    values: number[];
    statistics: {
      truncated: string;
      token_count: number;
    };
  };
}

export interface GoogleEmbedResponse {
  predictions: EmbedPredictionsResponse[];
  metadata: {
    billableCharacterCount: number;
  };
}
