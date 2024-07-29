import { BEDROCK } from '../../globals';
import { Params } from '../../types/requestBody';
import { transformAI21CompletionFinishReason } from '../ai21/complete';
import { AI21_FINISH_REASON } from '../ai21/types';
import { ANTHROPIC_STOP_REASON } from '../anthropic/types';
import {
  transformAnthropicCompletionFinishReason,
  transformAnthropicCompletionStreamChunkFinishReason,
} from '../anthropic/complete';
import {
  CompletionResponse,
  ErrorResponse,
  OPEN_AI_COMPLETION_FINISH_REASON,
  ProviderConfig,
} from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';
import { BEDROCK_LLAMA_STOP_REASON } from './types';

export const BedrockAnthropicCompleteConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    transform: (params: Params) => `\n\nHuman: ${params.prompt}\n\nAssistant:`,
    required: true,
  },
  max_tokens: {
    param: 'max_tokens_to_sample',
    required: true,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: -1,
    min: -1,
  },
  top_k: {
    param: 'top_k',
    default: -1,
  },
  stop: {
    param: 'stop_sequences',
    transform: (params: Params) => {
      if (params.stop === null) {
        return [];
      }
      return params.stop;
    },
  },
  user: {
    param: 'metadata.user_id',
  },
};

export const BedrockCohereCompleteConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  max_tokens: {
    param: 'max_tokens',
    default: 20,
    min: 1,
  },
  temperature: {
    param: 'temperature',
    default: 0.75,
    min: 0,
    max: 5,
  },
  top_p: {
    param: 'p',
    default: 0.75,
    min: 0,
    max: 1,
  },
  top_k: {
    param: 'k',
    default: 0,
    max: 500,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    default: 0,
    min: 0,
    max: 1,
  },
  presence_penalty: {
    param: 'presence_penalty',
    default: 0,
    min: 0,
    max: 1,
  },
  logit_bias: {
    param: 'logit_bias',
  },
  n: {
    param: 'num_generations',
    default: 1,
    min: 1,
    max: 5,
  },
  stop: {
    param: 'end_sequences',
  },
  stream: {
    param: 'stream',
  },
};

export const BedrockLLamaCompleteConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  max_tokens: {
    param: 'max_gen_len',
    default: 512,
    min: 1,
    max: 2048,
  },
  temperature: {
    param: 'temperature',
    default: 0.5,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: 0.9,
    min: 0,
    max: 1,
  },
};

export const BedrockMistralCompleteConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  max_tokens: {
    param: 'max_tokens',
    default: 20,
    min: 1,
  },
  temperature: {
    param: 'temperature',
    default: 0.75,
    min: 0,
    max: 5,
  },
  top_p: {
    param: 'top_p',
    default: 0.75,
    min: 0,
    max: 1,
  },
  top_k: {
    param: 'top_k',
    default: 0,
  },
  stop: {
    param: 'stop',
  },
};

const transformTitanGenerationConfig = (params: Params) => {
  const generationConfig: Record<string, any> = {};
  if (params['temperature']) {
    generationConfig['temperature'] = params['temperature'];
  }
  if (params['top_p']) {
    generationConfig['topP'] = params['top_p'];
  }
  if (params['max_tokens']) {
    generationConfig['maxTokenCount'] = params['max_tokens'];
  }
  if (params['stop']) {
    generationConfig['stopSequences'] = params['stop'];
  }
  return generationConfig;
};

export const BedrockTitanCompleteConfig: ProviderConfig = {
  prompt: {
    param: 'inputText',
    required: true,
  },
  temperature: {
    param: 'textGenerationConfig',
    transform: (params: Params) => transformTitanGenerationConfig(params),
  },
  max_tokens: {
    param: 'textGenerationConfig',
    transform: (params: Params) => transformTitanGenerationConfig(params),
  },
  top_p: {
    param: 'textGenerationConfig',
    transform: (params: Params) => transformTitanGenerationConfig(params),
  },
};

export const BedrockAI21CompleteConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  max_tokens: {
    param: 'maxTokens',
    default: 200,
  },
  temperature: {
    param: 'temperature',
    default: 0.7,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'topP',
    default: 1,
  },
  stop: {
    param: 'stopSequences',
  },
  presence_penalty: {
    param: 'presencePenalty',
    transform: (params: Params) => {
      return {
        scale: params.presence_penalty,
      };
    },
  },
  frequency_penalty: {
    param: 'frequencyPenalty',
    transform: (params: Params) => {
      return {
        scale: params.frequency_penalty,
      };
    },
  },
  countPenalty: {
    param: 'countPenalty',
  },
  frequencyPenalty: {
    param: 'frequencyPenalty',
  },
  presencePenalty: {
    param: 'presencePenalty',
  },
};

export interface BedrockLlamaCompleteResponse {
  generation: string;
  prompt_token_count: number;
  generation_token_count: number;
  stop_reason: BEDROCK_LLAMA_STOP_REASON | string;
}

const transformBedrockLlamaCompletionStopReason = (
  stopReason: BEDROCK_LLAMA_STOP_REASON | string
): OPEN_AI_COMPLETION_FINISH_REASON => {
  switch (stopReason) {
    case BEDROCK_LLAMA_STOP_REASON.length:
      return OPEN_AI_COMPLETION_FINISH_REASON.length;
    case BEDROCK_LLAMA_STOP_REASON.stop:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
    default:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
  }
}

const transformBedrockLlamaCompletionStreamStopReason = (
  stopReason?: BEDROCK_LLAMA_STOP_REASON | string | null
): OPEN_AI_COMPLETION_FINISH_REASON | null => {
  if (!stopReason) return null;
  return transformBedrockLlamaCompletionStopReason(stopReason);
}

export const BedrockLlamaCompleteResponseTransform: (
  response: BedrockLlamaCompleteResponse | BedrockErrorResponse,
  responseStatus: number
) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('generation' in response) {
    return {
      id: Date.now().toString(),
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: [
        {
          text: response.generation,
          index: 0,
          logprobs: null,
          finish_reason: transformBedrockLlamaCompletionStopReason(response.stop_reason),
        }
      ],
      usage: {
        prompt_tokens: response.prompt_token_count,
        completion_tokens: response.generation_token_count,
        total_tokens:
          response.prompt_token_count + response.generation_token_count,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export interface BedrockLlamaStreamChunk {
  generation: string;
  prompt_token_count: number;
  generation_token_count: number;
  stop_reason: BEDROCK_LLAMA_STOP_REASON | string | null;
  'amazon-bedrock-invocationMetrics': {
    inputTokenCount: number;
    outputTokenCount: number;
    invocationLatency: number;
    firstByteLatency: number;
  };
}

export const BedrockLlamaCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.trim();
  const parsedChunk: BedrockLlamaStreamChunk = JSON.parse(chunk);

  if (parsedChunk.stop_reason) {
    return [
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: BEDROCK,
        choices: [
          {
            text: '',
            index: 0,
            logprobs: null,
            finish_reason: transformBedrockLlamaCompletionStreamStopReason(parsedChunk.stop_reason),
          },
        ],
        usage: {
          prompt_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount,
          completion_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
          total_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount +
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
        },
      })}\n\n`,
      `data: [DONE]\n\n`,
    ];
  }

  return `data: ${JSON.stringify({
    id: fallbackId,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: BEDROCK,
    choices: [
      {
        text: parsedChunk.generation,
        index: 0,
        logprobs: null,
        finish_reason: null,
      },
    ],
  })}\n\n`;
};

export enum BEDROCK_TITAN_COMPLETION_REASON {
  FINISHED = 'FINISHED',
  LENGTH = 'LENGTH',
  STOP_CRITERIA_MET = 'STOP_CRITERIA_MET',
  RAG_QUERY_WHEN_RAG_DISABLED = 'RAG_QUERY_WHEN_RAG_DISABLED',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
}

export interface BedrockTitanCompleteResponse {
  inputTextTokenCount: number;
  results: {
    tokenCount: number;
    outputText: string;
    completionReason: BEDROCK_TITAN_COMPLETION_REASON | string;
  }[];
}

const transformBedrockTitanCompletionReason = (
  completionReason: BEDROCK_TITAN_COMPLETION_REASON | string
): OPEN_AI_COMPLETION_FINISH_REASON => {
  switch (completionReason) {
    case BEDROCK_TITAN_COMPLETION_REASON.FINISHED:
    case BEDROCK_TITAN_COMPLETION_REASON.STOP_CRITERIA_MET:
    case BEDROCK_TITAN_COMPLETION_REASON.RAG_QUERY_WHEN_RAG_DISABLED:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
    case BEDROCK_TITAN_COMPLETION_REASON.LENGTH:
      return OPEN_AI_COMPLETION_FINISH_REASON.length;
    case BEDROCK_TITAN_COMPLETION_REASON.CONTENT_FILTERED:
      return OPEN_AI_COMPLETION_FINISH_REASON.content_filter;
    default:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
  }
};

const transformBedrockTitanCompletionStreamReason = (
  completionReason?: BEDROCK_TITAN_COMPLETION_REASON | string | null
): OPEN_AI_COMPLETION_FINISH_REASON | null => {
  if (!completionReason) return null;
  return transformBedrockTitanCompletionReason(completionReason);
}

export const BedrockTitanCompleteResponseTransform: (
  response: BedrockTitanCompleteResponse | BedrockErrorResponse,
  responseStatus: number
) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('results' in response) {
    const completionTokens = response.results
      .map((r) => r.tokenCount)
      .reduce((partialSum, a) => partialSum + a, 0);
    return {
      id: Date.now().toString(),
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: response.results.map((generation, index) => ({
        text: generation.outputText,
        index: index,
        logprobs: null,
        finish_reason: transformBedrockTitanCompletionReason(
          generation.completionReason
        ),
      })),
      usage: {
        prompt_tokens: response.inputTextTokenCount,
        completion_tokens: completionTokens,
        total_tokens: response.inputTextTokenCount + completionTokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export interface BedrockTitanStreamChunk {
  outputText: string;
  index: number;
  totalOutputTextTokenCount: number;
  completionReason: BEDROCK_TITAN_COMPLETION_REASON | string | null;
  'amazon-bedrock-invocationMetrics': {
    inputTokenCount: number;
    outputTokenCount: number;
    invocationLatency: number;
    firstByteLatency: number;
  };
}

export const BedrockTitanCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.trim();
  const parsedChunk: BedrockTitanStreamChunk = JSON.parse(chunk);

  return [
    `data: ${JSON.stringify({
      id: fallbackId,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: [
        {
          text: parsedChunk.outputText,
          index: 0,
          logprobs: null,
          finish_reason: null,
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: fallbackId,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: [
        {
          text: '',
          index: 0,
          logprobs: null,
          finish_reason: transformBedrockTitanCompletionStreamReason(parsedChunk.completionReason),
        },
      ],
      usage: {
        prompt_tokens:
          parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount,
        completion_tokens:
          parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
        total_tokens:
          parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount +
          parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
      },
    })}\n\n`,
    `data: [DONE]\n\n`,
  ];
};

export interface BedrockAI21CompleteResponse {
  id: number;
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

export const BedrockAI21CompleteResponseTransform: (
  response: BedrockAI21CompleteResponse | BedrockErrorResponse,
  responseStatus: number,
  responseHeaders: Headers
) => CompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders
) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('completions' in response) {
    const prompt_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Input-Token-Count')) || 0;
    const completion_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Output-Token-Count')) || 0;
    return {
      id: response.id.toString(),
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: response.completions.map((completion, index) => ({
        text: completion.data.text,
        index: index,
        logprobs: null,
        finish_reason: transformAI21CompletionFinishReason(
          completion.finishReason?.reason
        ),
      })),
      usage: {
        prompt_tokens: prompt_tokens,
        completion_tokens: completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export interface BedrockAnthropicCompleteResponse {
  completion: string;
  stop_reason: ANTHROPIC_STOP_REASON | string;
  stop: null | string;
}

export const BedrockAnthropicCompleteResponseTransform: (
  response: BedrockAnthropicCompleteResponse | BedrockErrorResponse,
  responseStatus: number,
  responseHeaders: Headers
) => CompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders
) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('completion' in response) {
    const prompt_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Input-Token-Count')) || 0;
    const completion_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Output-Token-Count')) || 0;
    return {
      id: Date.now().toString(),
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: [
        {
          text: response.completion,
          index: 0,
          logprobs: null,
          finish_reason: transformAnthropicCompletionFinishReason(
            response.stop_reason
          ),
        },
      ],
      usage: {
        prompt_tokens: prompt_tokens,
        completion_tokens: completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export interface BedrockAnthropicStreamChunk {
  completion: string;
  stop_reason: ANTHROPIC_STOP_REASON | string;
  stop: string | null;
  'amazon-bedrock-invocationMetrics': {
    inputTokenCount: number;
    outputTokenCount: number;
    invocationLatency: number;
    firstByteLatency: number;
  };
}

export const BedrockAnthropicCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();

  const parsedChunk: BedrockAnthropicStreamChunk = JSON.parse(chunk);
  if (parsedChunk.stop_reason) {
    return [
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: BEDROCK,
        choices: [
          {
            text: parsedChunk.completion,
            index: 0,
            logprobs: null,
            finish_reason: null,
          },
        ],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: BEDROCK,
        choices: [
          {
            text: '',
            index: 0,
            logprobs: null,
            finish_reason: transformAnthropicCompletionStreamChunkFinishReason(
              parsedChunk.stop_reason
            ),
          },
        ],
        usage: {
          prompt_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount,
          completion_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
          total_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount +
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
        },
      })}\n\n`,
      `data: [DONE]\n\n`,
    ];
  }
  return `data: ${JSON.stringify({
    id: fallbackId,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: BEDROCK,
    choices: [
      {
        text: parsedChunk.completion,
        index: 0,
        logprobs: null,
        finish_reason: null,
      },
    ],
  })}\n\n`;
};

export enum BEDROCK_COHERE_FINISH_REASON {
  COMPLETE = 'COMPLETE',
  MAX_TOKENS = 'MAX_TOKENS',
  ERROR = 'ERROR',
  ERROR_TOXIC = 'ERROR_TOXIC',
}

export interface BedrockCohereCompleteResponse {
  id: string;
  generations: {
    id: string;
    text: string;
    finish_reason: BEDROCK_COHERE_FINISH_REASON | string;
  }[];
  prompt: string;
}

const transformBedrockCohereCompletionFinishReason = (
  finishReason: BEDROCK_COHERE_FINISH_REASON | string
): OPEN_AI_COMPLETION_FINISH_REASON => {
  switch (finishReason) {
    case BEDROCK_COHERE_FINISH_REASON.COMPLETE:
    case BEDROCK_COHERE_FINISH_REASON.ERROR:
    case BEDROCK_COHERE_FINISH_REASON.ERROR_TOXIC:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
    case BEDROCK_COHERE_FINISH_REASON.MAX_TOKENS:
      return OPEN_AI_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
  }
};

const transformBedrockCohereCompletionStreamFinishReason = (
  finishReason?: BEDROCK_COHERE_FINISH_REASON | string | null) : OPEN_AI_COMPLETION_FINISH_REASON | null => {
    if (!finishReason) return null;
    return transformBedrockCohereCompletionFinishReason(finishReason);
  }

export const BedrockCohereCompleteResponseTransform: (
  response: BedrockCohereCompleteResponse | BedrockErrorResponse,
  responseStatus: number,
  responseHeaders: Headers
) => CompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders
) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('generations' in response) {
    const prompt_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Input-Token-Count')) || 0;
    const completion_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Output-Token-Count')) || 0;
    return {
      id: response.id,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: response.generations.map((generation, index) => ({
        text: generation.text,
        index: index,
        logprobs: null,
        finish_reason: transformBedrockCohereCompletionFinishReason(
          generation.finish_reason
        ),
      })),
      usage: {
        prompt_tokens: prompt_tokens,
        completion_tokens: completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export interface BedrockCohereStreamChunk {
  text: string;
  is_finished: boolean;
  index?: number;
  finish_reason?: BEDROCK_COHERE_FINISH_REASON | string;
  'amazon-bedrock-invocationMetrics': {
    inputTokenCount: number;
    outputTokenCount: number;
    invocationLatency: number;
    firstByteLatency: number;
  };
}

export const BedrockCohereCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  const parsedChunk: BedrockCohereStreamChunk = JSON.parse(chunk);

  // discard the last cohere chunk as it sends the whole response combined.
  if (parsedChunk.is_finished) {
    return [
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: BEDROCK,
        choices: [
          {
            text: '',
            index: 0,
            logprobs: null,
            finish_reason: transformBedrockCohereCompletionStreamFinishReason(parsedChunk.finish_reason),
          },
        ],
        usage: {
          prompt_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount,
          completion_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
          total_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount +
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
        },
      })}\n\n`,
      `data: [DONE]\n\n`,
    ];
  }

  return `data: ${JSON.stringify({
    id: fallbackId,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: BEDROCK,
    choices: [
      {
        text: parsedChunk.text,
        index: parsedChunk.index ?? 0,
        logprobs: null,
        finish_reason: null,
      },
    ],
  })}\n\n`;
};

export interface BedrocMistralStreamChunk {
  outputs: {
    text: string;
    stop_reason: string | null;
  }[];
  'amazon-bedrock-invocationMetrics': {
    inputTokenCount: number;
    outputTokenCount: number;
    invocationLatency: number;
    firstByteLatency: number;
  };
}

export enum BEDROCK_MISTRAL_STOP_REASON {
  stop = 'stop',
  length = 'length',
  tool_calls = 'tool_calls',
}

const transformBedrockMistralCompletionStopReason = (
  stopReason: BEDROCK_MISTRAL_STOP_REASON | string
): OPEN_AI_COMPLETION_FINISH_REASON => {
  switch (stopReason) {
    case BEDROCK_MISTRAL_STOP_REASON.stop:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
    case BEDROCK_MISTRAL_STOP_REASON.length:
      return OPEN_AI_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
  }
};

const transformBedrockMistralCompletionStreamStopReason = (
  stopReason?: BEDROCK_MISTRAL_STOP_REASON | string | null
): OPEN_AI_COMPLETION_FINISH_REASON | null => {
  if (!stopReason) return null;
  return transformBedrockMistralCompletionStopReason(stopReason);
}

export const BedrockMistralCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.trim();
  const parsedChunk: BedrocMistralStreamChunk = JSON.parse(chunk);

  if (parsedChunk.outputs[0].stop_reason) {
    return [
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: BEDROCK,
        choices: [
          {
            text: parsedChunk.outputs[0].text,
            index: 0,
            logprobs: null,
            finish_reason: transformBedrockMistralCompletionStreamStopReason(parsedChunk.outputs[0].stop_reason),
          },
        ],
        usage: {
          prompt_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount,
          completion_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
          total_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount +
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
        },
      })}\n\n`,
      `data: [DONE]\n\n`,
    ];
  }

  return `data: ${JSON.stringify({
    id: fallbackId,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: BEDROCK,
    choices: [
      {
        text: parsedChunk.outputs[0].text,
        index: 0,
        logprobs: null,
        finish_reason: null,
      },
    ],
  })}\n\n`;
};


export interface BedrockMistralCompleteResponse {
  outputs: {
    text: string;
    stop_reason: BEDROCK_MISTRAL_STOP_REASON | string;
  }[];
}

export const BedrockMistralCompleteResponseTransform: (
  response: BedrockMistralCompleteResponse | BedrockErrorResponse,
  responseStatus: number,
  responseHeaders: Headers
) => CompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders
) => {
  if (responseStatus !== 200) {
    const errorResponse = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('outputs' in response) {
    const prompt_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Input-Token-Count')) || 0;
    const completion_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Output-Token-Count')) || 0;
    return {
      id: Date.now().toString(),
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: [
        {
          text: response.outputs[0].text,
          index: 0,
          logprobs: null,
          finish_reason: transformBedrockMistralCompletionStopReason(
            response.outputs[0].stop_reason
          ),
        },
      ],
      usage: {
        prompt_tokens: prompt_tokens,
        completion_tokens: completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
