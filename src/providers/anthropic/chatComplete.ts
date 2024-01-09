import { ANTHROPIC } from "../../globals";
import { Params, Message } from "../../types/requestBody";
import { ChatCompletionResponse, ErrorResponse, ProviderConfig } from "../types";

// TODO: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const AnthropicChatCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    default: "claude-2.1",
    required: true,
  },
  messages: [
    {
      param: "messages",
      required: true,
      transform: (params:Params) => {
        let messages:Message[] = [];
        // Transform the chat messages into a simple prompt
        if (!!params.messages) {
          params.messages.forEach(msg => {
            if (msg.role !== "system") {
              messages.push(msg);
            }
          })
        }

        return messages;
      }
    },
    {
      param: "system",
      required: false,
      transform: (params:Params) => {
        let systemMessage: string = "";
        // Transform the chat messages into a simple prompt
        if (!!params.messages) {
          params.messages.forEach(msg => {
            if (msg.role === "system") {
              systemMessage = msg.content as string;
            }
          })
        }
        return systemMessage;
      }
    }
  ],
  max_tokens: {
    param: "max_tokens",
    required: true,
  },
  temperature: {
    param: "temperature",
    default: 1,
    min: 0,
    max: 1,
  },
  top_p: {
    param: "top_p",
    default: -1,
    min: -1,
  },
  top_k: {
    param: "top_k",
    default: -1,
  },
  stop: {
    param: "stop_sequences",
  },
  stream: {
    param: "stream",
    default: false,
  },
  user: {
    param: "metadata.user_id",
  },
};

export interface AnthropicErrorObject {
  type: string;
  message: string;
}

interface AnthropicErrorResponse {
  type: string;
  error: AnthropicErrorObject;
}

interface AnthropicChatCompleteResponse {
  id: string;
  type: string;
  role: string;
  content: {
    type: string;
    text: string;
  }[];
  stop_reason: string;
  model: string;
  stop_sequence: null | string;
}

interface AnthropicChatCompleteStreamResponse {
  type: string;
  index: number;
  delta: {
    type: string;
    text: string;
    stop_reason?: string;
  }
}

// TODO: The token calculation is wrong atm
export const AnthropicChatCompleteResponseTransform: (response: AnthropicChatCompleteResponse | AnthropicErrorResponse, responseStatus: number) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return {
        error: {
            message: response.error?.message,
            type: response.error?.type,
            param: null,
            code: null
        },
        provider: ANTHROPIC
    } as ErrorResponse;
  } 

  if ('content' in response) {
    return {
      id: response.id,
      object: "chat_completion",
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      provider: ANTHROPIC,
      choices: [
        {
          message: {"role": "assistant", content: response.content[0].text},
          index: 0,
          logprobs: null,
          finish_reason: response.stop_reason,
        },
      ]
    }
  }

  return {
    error: {
        message: `Invalid response recieved from anthropic: ${JSON.stringify(response)}`,
        type: null,
        param: null,
        code: null
    },
    provider: ANTHROPIC
  } as ErrorResponse;
}
  

export const AnthropicChatCompleteStreamChunkTransform: (response: string, fallbackId: string) => string | undefined = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  if (
    chunk.startsWith("event: ping") ||
    chunk.startsWith("event: message_start") ||
    chunk.startsWith("event: content_block_start") ||
    chunk.startsWith("event: content_block_stop")
  ) {
      return;
  }

  if (chunk.startsWith("event: message_stop")) {
    return "data: [DONE]\n\n"
  }

  chunk = chunk.replace(/^event: content_block_delta[\r\n]*/, "");
  chunk = chunk.replace(/^event: message_delta[\r\n]*/, "");
  chunk = chunk.replace(/^data: /, "");
  chunk = chunk.trim();
  

  const parsedChunk: AnthropicChatCompleteStreamResponse = JSON.parse(chunk);
  return `data: ${JSON.stringify({
    id: fallbackId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "",
    provider: ANTHROPIC,
    choices: [
      {
        delta: {
          content: parsedChunk.delta?.text
        },
        index: 0,
        logprobs: null,
        finish_reason: parsedChunk.delta?.stop_reason ?? null,
      },
    ]
  })}` + '\n\n'
};