import { ChatCompletionResponse, ErrorResponse, ProviderConfig } from "../types";

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const AnyscaleChatCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    required: true,
    default: "meta-llama/Llama-2-7b-chat-hf"
  },
  messages: {
    param: "messages",
    default: "",
  },
  functions: {
    param: "functions",
  },
  function_call: {
    param: "function_call",
  },
  max_tokens: {
    param: "max_tokens",
    default: 100,
    min: 0,
  },
  temperature: {
    param: "temperature",
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: "top_p",
    default: 1,
    min: 0,
    max: 1,
  },
  n: {
    param: "n",
    default: 1,
  },
  stream: {
    param: "stream",
    default: false,
  },
  stop: {
    param: "stop",
  },
  presence_penalty: {
    param: "presence_penalty",
    min: -2,
    max: 2,
  },
  frequency_penalty: {
    param: "frequency_penalty",
    min: -2,
    max: 2,
  },
  logit_bias: {
    param: "logit_bias",
  },
  user: {
    param: "user",
  },
};

export interface AnyscaleChatCompleteResponse extends ChatCompletionResponse, ErrorResponse {}

export interface AnyscaleStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        delta: {
            content?: string;
        };
        index: number;
        finish_reason: string | null;
    }[]
}

export const AnyscaleChatCompleteResponseTransform: (response: AnyscaleChatCompleteResponse, responseStatus: number) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200) {
      return {
          error: {
              message: response.error?.message,
              type: response.error?.type,
              param: null,
              code: null
          },
          provider: "anyscale"
      } as ErrorResponse;
    } 
  
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: "anyscale",
      choices: response.choices,
      usage: response.usage
    }
  }
    
  
  export const AnyscaleChatCompleteStreamChunkTransform: (response: string) => string = (responseChunk) => {
    let chunk = responseChunk.trim();
    chunk = chunk.replace(/^data: /, "");
    chunk = chunk.trim();
    if (chunk === '[DONE]') {
      return chunk;
    }
    const parsedChunk: AnyscaleStreamChunk = JSON.parse(chunk);
    return `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: "anyscale",
      choices: parsedChunk.choices
    })}` + '\n\n'
  };