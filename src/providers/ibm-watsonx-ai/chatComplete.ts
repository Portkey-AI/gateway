import { IBM_WATSONX_AI } from '../../globals';
import {
  Message,
  Params,
  ToolCall,
  OpenAIMessageRole,
  ContentType,
  ToolChoice,
  SYSTEM_MESSAGE_ROLES,
  MESSAGE_ROLES,
} from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
  StreamChunk,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

// Types based on IBM Watsonx.ai OpenAPI spec
interface IBMTextChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | IBMTextChatUserContent[];
  name?: string; // for participant differentiation
  refusal?: string | null;
  tool_calls?: IBMTextChatToolCall[];
  tool_call_id?: string; // for tool role
}

interface IBMTextChatUserContentPart {
  type: 'text' | 'image_url' | 'video_url'; // and others if supported
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
  video_url?: { url: string };
}

type IBMTextChatUserContent = IBMTextChatUserContentPart[];

interface IBMTextChatFunctionCall {
  name: string;
  arguments: string; // JSON string
}

interface IBMTextChatToolCall {
  id: string;
  type: 'function';
  function: IBMTextChatFunctionCall;
}

interface IBMTextChatTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>; // JSON Schema
  };
}

interface IBMTextChatToolChoice {
  type: 'function';
  function: {
    name: string;
    description?: string; // Not in spec for choice, but good to align
  };
}

interface IBMTextChatRequest {
  model_id: string;
  messages: IBMTextChatMessage[];
  project_id?: string;
  space_id?: string;
  parameters?: { // Only add this object if there are parameters that ONLY go here
    decoding_method?: 'sample' | 'greedy';
    length_penalty?: { decay_factor: number; start_index: number };
    // Other TextGenParameters if needed and not at root
    // For now, assuming most common params are at root as per /text/chat examples
  }; 
  // Root level parameters as per /text/chat examples:
  max_tokens?: number;
  temperature?: number;
  time_limit?: number;
  stop_sequences?: string[];
  top_p?: number;
  top_k?: number;
  random_seed?: number;
  repetition_penalty?: number;
  // min_new_tokens? : number, // Spec shows min_new_tokens under TextGenParameters
  // Let's only add what's in the root examples or explicitly needed at root for text/chat
  tools?: IBMTextChatTool[];
  tool_choice?: 'auto' | 'none' | 'required' | IBMTextChatToolChoice; // 'auto', 'none', 'required' are not in spec, only object form
  response_format?: { type: 'json_object' };
  // Add other root params from TextChatRequest schema if needed by gateway
}

const transformGatewayMessagesToIBM = (
  messages: Message[],
  provider: string
): IBMTextChatMessage[] => {
  return messages.map((msg) => {
    const ibmMessage: IBMTextChatMessage = {
      role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
    };

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        ibmMessage.content = [{ type: 'text', text: msg.content }];
      } else if (Array.isArray(msg.content)) {
        ibmMessage.content = msg.content.map(
          (part: ContentType): IBMTextChatUserContentPart => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            }
            if (part.type === 'image_url') {
              // Assuming gateway image_url format matches IBM's expected structure for image_url part
              return {
                type: 'image_url',
                image_url: {
                  url: part.image_url.url,
                  detail: part.image_url.detail as
                    | 'low'
                    | 'high'
                    | 'auto'
                    | undefined,
                },
              };
            }
            // Add other content types (video_url) if gateway supports them and IBM needs them
            throw new Error(
              `Unsupported content type for IBM Watsonx.ai user message: ${part.type}`
            );
          }
        );
      }
    } else {
      // For system, assistant, tool roles, content is usually a string
      if (typeof msg.content === 'string' || msg.content === null) {
         // Allow null content for assistant messages if tool_calls are present
        if (msg.role === 'assistant' && msg.tool_calls && msg.content === null) {
            // Do nothing, content can be null if tool_calls are present
        } else if (typeof msg.content === 'string') {
            ibmMessage.content = msg.content;
        }
      }
    }
    

    if (msg.role === 'assistant' && msg.tool_calls) {
      ibmMessage.tool_calls = msg.tool_calls.map(
        (tc: ToolCall): IBMTextChatToolCall => ({
          id: tc.id || `call_${crypto.randomUUID()}`, // IBM requires id
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })
      );
    }

    if (msg.role === 'tool') {
      ibmMessage.tool_call_id = msg.tool_call_id;
      // ibmMessage.name = msg.name; // name isn't on IBM's tool message spec
    }
    
    if (msg.name) {
      ibmMessage.name = msg.name;
    }

    return ibmMessage;
  });
};

export const IBMWatsonXAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model_id',
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
    transform: (params: Params) =>
      transformGatewayMessagesToIBM(params.messages, IBM_WATSONX_AI),
  },
  project_id: { // Custom param, should be passed in providerOptions from gateway
    param: 'project_id',
    required: true,
    transform: (params: Params) => params.providerOptions.projectId,
  },
  max_tokens: {
    param: 'max_tokens', // As per TextChatRequest example
  },
  temperature: {
    param: 'temperature', // As per TextChatRequest example
  },
  top_p: {
    param: 'top_p', // In TextChatParameters, but let's assume it can be root based on common patterns
  },
  top_k: {
    param: 'top_k', // In TextChatParameters
  },
  stop: {
    param: 'stop_sequences', // As per TextGenParameters, often aliased
  },
  seed: {
    param: 'random_seed', // As per TextGenParameters
  },
  response_format: {
    param: 'response_format',
    transform: (params: Params) => {
        if (params.response_format?.type === 'json_object') {
            return { type: 'json_object' };
        }
        return undefined;
    }
  },
  tools: {
    param: 'tools',
    transform: (params: Params): IBMTextChatTool[] | undefined => {
      if (!params.tools) return undefined;
      return params.tools.map((tool) => ({
        type: tool.type as 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters as Record<string, any>,
        },
      }));
    },
  },
  tool_choice: {
    param: 'tool_choice',
    transform: (params: Params): string | IBMTextChatToolChoice | undefined => {
      if (!params.tool_choice) return undefined;
      if (typeof params.tool_choice === 'string') {
        // IBM spec for TextChatRequest tool_choice seems to only support the object form.
        // If 'auto', 'none', 'required' are truly needed, this might require a different IBM endpoint or interpretation.
        // For now, we only map the object form if gateway sends it.
        // Or, we can try to infer. 'auto' is default if tools are present. 'none' means tools are ignored.
        // 'required' would mean one of the tools must be called.
        // The IBM spec example shows `tool_choice: { type: "function", function: { name: "get_current_weather"}}`
        // which implies forcing a specific function.
        if (["auto", "none", "required"].includes(params.tool_choice)) {
            // The OpenAPI doesn't explicitly support these strings for tool_choice at /text/chat
            // It expects an object like: { type: "function", function: { name: "..." } }
            // The safest is to not pass it if it's one of these generic strings,
            // or if IBM has a way to represent them, use that.
            // For now, let's assume 'auto' is implicit if tools are provided and no specific tool_choice object is given.
            // 'none' could mean omitting the 'tools' parameter altogether or an IBM-specific value.
            // 'required' is tricky without direct IBM spec support.
            // Let's pass 'auto' if tools are present and tool_choice is 'auto' (though IBM spec doesn't show 'auto' string).
            // For now, if it's a string not matching a function name structure, we might omit it or log a warning.
            // Let's assume gateway might send an object for specific function choice.
            return undefined; 
        }
        // If it's a string that implies a specific function (not standard OpenAI but some providers allow this)
        // return { type: 'function', function: { name: params.tool_choice } };
      }
      if (typeof params.tool_choice === 'object' && params.tool_choice.type === 'function') {
        return {
          type: 'function',
          function: {
            name: params.tool_choice.function.name,
            // description: params.tool_choice.function.description // Not in IBM spec for tool_choice
          },
        };
      }
      return undefined;
    },
  },
  // IBM specific, can be added to providerOptions if needed
  time_limit: {
      param: 'time_limit'
  },
  // Default stream to false if not passed
  stream: {
    param: 'stream',
    default: false,
  },
};

interface IBMError {
  code: string;
  message: string;
  more_info?: string;
  target?: {
    type: string;
    name: string;
  };
}
interface IBMErrorResponse {
  trace: string;
  errors: IBMError[];
  // Sometimes error structure is different, e.g. directly under response
  error?: string; 
  reason?: string;
  message?: string;
}

interface IBMTextChatResponseChoice {
  index: number;
  message: IBMTextChatMessage;
  finish_reason: string | null;
  // logprobs might appear here if requested
}

interface IBMTextChatResponse {
  id: string;
  model_id: string;
  created: number; // Unix timestamp
  created_at: string; // ISO 8601
  choices: IBMTextChatResponseChoice[];
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
  // system?: any; // For warnings, etc.
}

// Transform for regular (non-streamed) response
export const IBMWatsonXAIChatCompleteResponseTransform: (
  response: IBMTextChatResponse | IBMErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 || 'errors' in response || 'error' in response) {
    const errorResponse = response as IBMErrorResponse;
    const firstError = errorResponse.errors?.[0];
    return generateErrorResponse(
      {
        message: firstError?.message || errorResponse.message || errorResponse.error || 'Unknown error',
        type: firstError?.code || String(responseStatus),
        param: firstError?.target?.name || null,
        code: firstError?.code || null,
      },
      IBM_WATSONX_AI
    );
  }

  const ibmResponse = response as IBMTextChatResponse;
  const firstChoice = ibmResponse.choices[0];

  const gatewayChoice = {
    index: firstChoice.index,
    message: {
      role: firstChoice.message.role,
      content: firstChoice.message.content as string | null, // Assuming content is string or null after transformation
      tool_calls: firstChoice.message.tool_calls?.map(
        (tc): ToolCall => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })
      ),
    },
    finish_reason: firstChoice.finish_reason ?? 'unknown',
    // logprobs: firstChoice.logprobs // if gateway supports it
  };
  
  // Handle if content is an array of parts (e.g. from a user message reflection)
  // For assistant responses, content is usually a string. If it's structured, it needs careful handling.
  // The spec's example for assistant response has `content: "string"`
  if (Array.isArray(firstChoice.message.content) && firstChoice.message.content[0]?.type === 'text') {
    gatewayChoice.message.content = (firstChoice.message.content[0] as IBMTextChatUserContentPart).text ?? null;
  }


  return {
    id: ibmResponse.id,
    object: 'chat.completion',
    created: ibmResponse.created || Math.floor(new Date(ibmResponse.created_at).getTime() / 1000),
    model: ibmResponse.model_id,
    provider: IBM_WATSONX_AI,
    choices: [gatewayChoice],
    usage: ibmResponse.usage
      ? {
          prompt_tokens: ibmResponse.usage.prompt_tokens,
          completion_tokens: ibmResponse.usage.completion_tokens,
          total_tokens: ibmResponse.usage.total_tokens,
        }
      : undefined,
  };
};


// Transform for streamed response chunks
// IBM's stream item: TextChatStreamItem (allOf TextChatResponseFieldsShared, TextChatResponseFieldsStream, System)
// TextChatResponseFieldsStream has choices with TextChatResultChoiceStream (index, delta, finish_reason)
// TextChatResultDelta has (role, content, refusal, tool_calls with TextChatToolCallStream)
// TextChatToolCallStream has (index, id, type, function with name, arguments)

interface IBMTextChatStreamDelta {
    role?: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    refusal?: string | null;
    tool_calls?: {
        index: number; // Index of the tool call in the list for this delta
        id?: string;
        type?: 'function';
        function?: {
            name?: string;
            arguments?: string; // Partial arguments
        };
    }[];
}

interface IBMTextChatStreamChoice {
    index: number;
    delta: IBMTextChatStreamDelta;
    finish_reason: string | null;
    // logprobs might appear here
}

interface IBMTextChatStreamItem {
    id: string;
    model_id: string;
    created: number;
    created_at: string;
    choices: IBMTextChatStreamChoice[];
    usage?: {
        completion_tokens: number;
        prompt_tokens: number;
        total_tokens: number;
      };
    // system?: any;
}


export const IBMWatsonXAIChatCompleteStreamChunkTransform: (
  responseChunk: string,
  fallbackId: string
) => string | undefined = (responseChunk, fallbackId) => {
  // IBM watsonx.ai SSE format is typically `event: message\ndata: {...}\n\n` or just `data: {...}\n\n`
  // We need to parse the JSON data part.
  letchunk = responseChunk.trim();

  // Remove potential "event: <event_name>" and "id: <id>" lines if present
  chunk = chunk
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.substring('data:'.length).trim())
    .join('');
  
  if (!chunk) {
    return undefined; // Empty line or non-data line
  }

  // Check for special stream termination message if IBM uses one (OpenAI uses [DONE])
  // The IBM spec for text/event-stream on chat_stream just says it's an array of TextChatStreamItem.
  // This implies each "data:" payload is one such item.
  // There's no explicit [DONE] in the IBM spec example, usually the stream just ends.
  // The gateway usually expects a `data: [DONE]\n\n` to terminate. If IBM doesn't send it,
  // the gateway might handle stream termination by closing the connection.

  try {
    const ibmData: IBMTextChatStreamItem = JSON.parse(chunk);

    if (!ibmData.choices || ibmData.choices.length === 0) {
        // If it's a non-choice related message (e.g. just usage or final empty message),
        // we might still need to forward it if it contains usage or a finish reason for the whole stream.
        // Or if it's an error in the stream.
        if (ibmData.usage) { // This means it's likely the last message with usage stats
            const streamChunk: StreamChunk = {
                id: ibmData.id || fallbackId,
                object: 'chat.completion.chunk',
                created: ibmData.created || Math.floor(new Date(ibmData.created_at).getTime() / 1000),
                model: ibmData.model_id,
                provider: IBM_WATSONX_AI,
                choices: [], // No delta content, but might have overall finish reason
                usage: {
                    prompt_tokens: ibmData.usage.prompt_tokens,
                    completion_tokens: ibmData.usage.completion_tokens,
                    total_tokens: ibmData.usage.total_tokens,
                }
            };
             // If there's a finish_reason at the top level of choice for the stream after all deltas.
            if (ibmData.choices?.[0]?.finish_reason && !ibmData.choices[0].delta.content && !ibmData.choices[0].delta.tool_calls) {
                streamChunk.choices.push({
                    index: ibmData.choices[0].index,
                    delta: {},
                    finish_reason: ibmData.choices[0].finish_reason,
                });
            }
            return `data: ${JSON.stringify(streamChunk)}\n\n`;
        }
        return undefined; // Or handle as an error if appropriate
    }


    const firstChoice = ibmData.choices[0];
    const delta: Record<string, any> = {};

    if (firstChoice.delta.role) {
      delta.role = firstChoice.delta.role;
    }
    if (firstChoice.delta.content) {
      delta.content = firstChoice.delta.content;
    }
    if (firstChoice.delta.tool_calls && firstChoice.delta.tool_calls.length > 0) {
      delta.tool_calls = firstChoice.delta.tool_calls.map(tc => ({
        index: tc.index, // This is the index of the tool_call in the assistant's turn
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function?.name,
          arguments: tc.function?.arguments,
        },
      }));
    }

    const streamChunk: StreamChunk = {
      id: ibmData.id || fallbackId,
      object: 'chat.completion.chunk',
      created: ibmData.created || Math.floor(new Date(ibmData.created_at).getTime() / 1000),
      model: ibmData.model_id,
      provider: IBM_WATSONX_AI,
      choices: [
        {
          index: firstChoice.index,
          delta: delta,
          finish_reason: firstChoice.finish_reason,
          // logprobs: firstChoice.logprobs // if gateway supports it
        },
      ],
    };
    
    if (ibmData.usage) {
        streamChunk.usage = {
            prompt_tokens: ibmData.usage.prompt_tokens,
            completion_tokens: ibmData.usage.completion_tokens,
            total_tokens: ibmData.usage.total_tokens,
        }
    }


    return `data: ${JSON.stringify(streamChunk)}\n\n`;
  } catch (error) {
    console.error('Error parsing IBM Watsonx.ai stream chunk:', error, 'Raw chunk:', responseChunk);
    // Potentially return an error chunk if the format is standardized
    // For now, returning undefined to skip malformed chunks.
    // Or, if it's an API error formatted in JSON:
    try {
        const errorResponse: IBMErrorResponse = JSON.parse(chunk);
        if (errorResponse.errors || errorResponse.error) {
            const firstError = errorResponse.errors?.[0];
            const formattedError = generateErrorResponse(
              {
                message: firstError?.message || errorResponse.message || errorResponse.error || 'Unknown stream error',
                type: firstError?.code || "stream_error",
                param: firstError?.target?.name || null,
                code: firstError?.code || null,
              },
              IBM_WATSONX_AI
            );
            // The gateway might expect errors in a specific stream format.
            // For now, just logging and skipping. Or wrap in data: {}
            return `data: ${JSON.stringify({error: formattedError})}\n\n`;
        }
    } catch (e) {
        // not a JSON error object
    }
    return undefined;
  }
};