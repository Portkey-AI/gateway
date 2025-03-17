import { ErrorResponse, ProviderConfig } from '../types';
import { generateErrorResponse } from '../utils';

interface Message {
  role?: 'system' | 'user' | 'assistant';
  content: string;
}

interface ResponseFormat {
  type: string;
  schema?: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface CortexChatCompleteRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  response_format?: ResponseFormat;
  stream?: boolean;
}

interface CortexChatCompleteResponse {
  id: string;
  created: number;
  model: string;
  choices: {
    delta?: {
      content: string;
    };
    message?: Message;
    finish_reason?: string;
    index?: number;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompleteResponse {
  id: string;
  created: number;
  model: string;
  choices: {
    delta?: {
      content: string;
    };
    message?: Message;
    finish_reason?: string;
    index?: number;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const CortexChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    default: 'mistral-large',
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
  },
  temperature: {
    param: 'temperature',
    default: 0.0,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: 0.0,
    min: 0,
    max: 1,
  },
  max_tokens: {
    param: 'max_tokens',
    default: 1000,
    min: 1,
    max: 4096,
  },
  response_format: {
    param: 'response_format',
  },
  stream: {
    param: 'stream',
    default: false,
  },
};

export const CortexChatCompleteResponseTransform: (
  response: CortexChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => ChatCompleteResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || 'error' in response) {
    return CortexErrorResponseTransform(response as ErrorResponse, 'CORTEX');
  }
  return response as ChatCompleteResponse;
};

export const CortexErrorResponseTransform: (
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
