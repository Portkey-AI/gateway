import { COHERE } from '../../globals';
import { Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformFinishReason,
} from '../utils';
import {
  COHERE_STOP_REASON,
  CohereChatCompleteResponse,
  CohereChatCompletionStreamChunk,
  CohereErrorResponse,
  CohereStreamState,
} from './types';

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const CohereChatCompleteConfig: ProviderConfig = {
  stream: {
    param: 'stream',
    default: false,
  },
  model: {
    param: 'model',
    required: false,
  },
  messages: {
    param: 'messages',
    required: true,
    transform: (params: Params) => {
      return params.messages?.map((message) => {
        const role = message.role === 'developer' ? 'system' : message.role;
        return {
          role,
          content: message.content,
        };
      });
    },
  },
  max_tokens: {
    param: 'max_tokens',
    required: false,
  },
  stop: {
    param: 'stop_sequences',
    required: false,
    transform: (params: Params) => {
      if (typeof params.stop === 'string') {
        return [params.stop];
      }
      return params.stop;
    },
  },
  temperature: {
    param: 'temperature',
    required: false,
  },
  seed: {
    param: 'seed',
    required: false,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    required: false,
  },
  presence_penalty: {
    param: 'presence_penalty',
    required: false,
  },
  response_format: [
    {
      param: 'response_format',
      required: false,
    },
    {
      param: 'strict_tools',
      required: false,
      transform: (params: Params) => {
        if (params.response_format?.type === 'json_schema') {
          return params.response_format?.json_schema?.strict;
        }
        return null;
      },
    },
  ],
  top_p: {
    param: 'p',
    required: false,
  },
  tools: {
    param: 'tools',
    required: false,
  },
  tool_choice: {
    param: 'tool_choice',
    required: false,
    transform: (params: Params) => {
      if (typeof params.tool_choice === 'string') {
        switch (params.tool_choice) {
          case 'required':
            return 'REQUIRED';
          case 'auto':
            return null;
          case 'none':
            return 'NONE';
        }
      }
      return 'REQUIRED';
    },
  },
  // cohere specific parameters
  documents: {
    param: 'documents',
    required: false,
  },
  citation_options: {
    param: 'citation_options',
    required: false,
  },
  safety_mode: {
    param: 'safety_mode',
    required: false,
  },
  k: {
    param: 'k',
    required: false,
  },
  thinking: {
    param: 'thinking',
    required: false,
  },
};

export const CohereChatCompleteResponseTransform: (
  response: CohereChatCompleteResponse | CohereErrorResponse,
  responseStatus: number,
  responseHeaders: Headers,
  strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string,
  gatewayRequest: Params
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders,
  strictOpenAiCompliance,
  _gatewayRequestUrl,
  gatewayRequest
) => {
  if (
    responseStatus !== 200 &&
    'message' in response &&
    typeof response.message === 'string'
  ) {
    return generateErrorResponse(
      {
        message: response.message || '',
        type: null,
        param: null,
        code: null,
      },
      COHERE
    );
  }

  if ('message' in response && 'usage' in response) {
    const prompt_tokens =
      response.usage?.tokens?.input_tokens ??
      response.usage?.billed_units?.input_tokens ??
      0;
    const completion_tokens =
      response.usage?.tokens?.output_tokens ??
      response.usage?.billed_units?.output_tokens ??
      0;
    const total_tokens = prompt_tokens + completion_tokens;
    return {
      id: response.id,
      model: gatewayRequest.model || '',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      provider: COHERE,
      choices: [
        {
          index: 0,
          finish_reason: transformFinishReason(
            response.finish_reason as COHERE_STOP_REASON,
            strictOpenAiCompliance
          ),
          message: {
            role: 'assistant',
            content:
              response.message?.content?.reduce((acc, item) => {
                if (item.type === 'text') {
                  acc += item.text;
                }
                return acc;
              }, '') ?? '',
            tool_calls: response.message.tool_calls,
          },
        },
      ],
      usage: {
        completion_tokens,
        prompt_tokens,
        total_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, COHERE);
};

export const CohereChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: CohereStreamState,
  strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string = (
  responseChunk,
  fallbackId,
  streamState = { generation_id: '', lastIndex: 0 },
  strictOpenAiCompliance,
  gatewayRequest
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^event:.*[\r\n]*/, '');
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  const parsedChunk: CohereChatCompletionStreamChunk = JSON.parse(chunk);
  if (parsedChunk.type === 'message-start') {
    streamState.generation_id = parsedChunk.id;
  }
  const model = gatewayRequest.model || '';

  if (parsedChunk.type === 'message-end') {
    const prompt_tokens =
      parsedChunk.delta?.usage?.tokens?.input_tokens ??
      parsedChunk.delta?.usage?.billed_units?.input_tokens ??
      0;
    const completion_tokens =
      parsedChunk.delta?.usage?.tokens?.output_tokens ??
      parsedChunk.delta?.usage?.billed_units?.output_tokens ??
      0;
    const total_tokens = prompt_tokens + completion_tokens;
    const usage = {
      completion_tokens,
      prompt_tokens,
      total_tokens,
    };
    return (
      `data: ${JSON.stringify({
        id: streamState.generation_id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
          {
            index: streamState.lastIndex,
            delta: {},
            logprobs: null,
            finish_reason: transformFinishReason(
              parsedChunk.delta?.finish_reason,
              strictOpenAiCompliance
            ),
          },
        ],
        usage,
      })}` +
      '\n\n' +
      'data: [DONE]\n\n'
    );
  }
  if ('index' in parsedChunk && parsedChunk.index !== streamState.lastIndex) {
    streamState.lastIndex = parsedChunk.index ?? 0;
  }

  return (
    `data: ${JSON.stringify({
      id: streamState.generation_id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model,
      system_fingerprint: null,
      choices: [
        {
          index: streamState.lastIndex,
          delta: {
            role: 'assistant',
            content: (parsedChunk as any).delta?.message?.content?.text ?? '',
            tool_calls: (parsedChunk as any).delta?.message?.tool_calls,
          },
          logprobs: null,
          finish_reason: null,
        },
      ],
    })}` + '\n\n'
  );
};
