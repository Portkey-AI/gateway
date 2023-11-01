import { Params, Message } from "../../types/requestBody";
import { ChatCompletionResponse, ErrorResponse, ProviderConfig } from "../types";

// TODO: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const AnthropicChatCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    default: "claude-instant-1",
    required: true,
  },
  messages: {
    param: "prompt",
    required: true,
    transform: (params:Params) => {
      let prompt:string = "";
      // Transform the chat messages into a simple prompt
      if (!!params.messages) {
        let messages:Message[] = params.messages;
        messages.forEach(msg => {
          if (msg.role == "user") {
            prompt+=`Human: ${msg.content}\n`
          } else if (msg.role == "assistant") {
            prompt+=`Assistant: ${msg.content}\n`
          }
        })
        prompt += "Assistant:";
      }

      return prompt;
    }
  },
  max_tokens: {
    param: "max_tokens_to_sample",
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

interface AnthropicErrorResponse {
  type: string;
  message: string;
}

interface AnthropicCompleteResponse {
  completion: string;
  stop_reason: string;
  model: string;
  truncated: boolean;
  stop: null | string;
  log_id: string;
  exception: null | string;
  status?: number;
  error?: AnthropicErrorResponse;
}

// TODO: The token calculation is wrong atm
export const AnthropicChatCompleteResponseTransform: (response: AnthropicCompleteResponse, responseStatus: number) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    return {
        error: {
            message: response.error?.message,
            type: response.error?.type,
            param: null,
            code: null
        },
        provider: "anthropic"
    } as ErrorResponse;
  } 

  return {
    id: response.log_id,
    object: "chat_completion",
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    provider: "anthropic",
    choices: [
      {
        message: {"role": "assistant", content: response.completion},
        index: 0,
        logprobs: null,
        finish_reason: response.stop_reason,
      },
    ]
  }
}
  

export const AnthropicChatCompleteStreamChunkTransform: (response: string) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^event: completion[\r\n]*/, "");
  chunk = chunk.replace(/^data: /, "");
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return chunk;
  }
  const parsedChunk: AnthropicCompleteResponse = JSON.parse(chunk);
  return `data: ${JSON.stringify({
    id: parsedChunk.log_id,
    object: "text_completion",
    created: Math.floor(Date.now() / 1000),
    model: parsedChunk.model,
    provider: "anthropic",
    choices: [
      {
        delta: {
          content: parsedChunk.completion
        },
        index: 0,
        logprobs: null,
        finish_reason: parsedChunk.stop_reason,
      },
    ]
  })}` + '\n\n'
};