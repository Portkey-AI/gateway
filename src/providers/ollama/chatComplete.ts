import {
  ChatCompletionResponse,
  CompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from "../types";
import { Params } from "../../types/requestBody";
import { OLLAMA } from "../../globals";
// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

const transformOptions = (params: Params) => {
  const options: Record<string, any> = {};
  if (params["temperature"]) {
    options["temperature"] = params["temperature"];
  }
  if (params["top_p"]) {
    options["top_p"] = params["top_p"];
  }
  if (params["top_k"]) {
    options["top_k"] = params["top_k"];
  }
  if (params["stop"]) {
    options["stop"] = params["stop"];
  }
  if (params["presence_penalty"]) {
    options["presence_penalty"] = params["presence_penalty"];
  }
  if (params["frequency_penalty"]) {
    options["frequency_penalty"] = params["frequency_penalty"];
  }
  if (params["max_tokens"]) {
    options["num_predict"] = params["max_tokens"];
  }
  return options;
};

export const OllamaChatCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
  },
  messages: {
    param: "messages",
    default: "",
  },
  max_tokens: {
    param: "options",
    transform: (params: Params) => transformOptions(params),
    default: 128,
    min: -2,
  },
  temperature: {
    param: "options",
    transform: (params: Params) => transformOptions(params),
    default: 0.8,
    min: 0,
    max: 2,
  },
  top_p: {
    param: "options",
    transform: (params: Params) => transformOptions(params),
    default: 0.9,
    min: 0,
    max: 1,
  },
  top_k: {
    param: "options",
    transform: (params: Params) => transformOptions(params),
    default: 40,
    min: 0,
    max: 100,
  },
  stream: {
    param: "stream",
    default: false,
  },
  stop: {
    param: "options",
    transform: (params: Params) => transformOptions(params),
  },
  presence_penalty: {
    param: "options",
    transform: (params: Params) => transformOptions(params),
    min: -2,
    max: 2,
  },
  frequency_penalty: {
    param: "options",
    transform: (params: Params) => transformOptions(params),
    min: -2,
    max: 2,
  },
};

interface OllamaChatCompleteResponse {
  model: string;
  created_at: number;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

interface OllamaErrorResponse {
  error: string;
}

export const OllamaChatCompleteResponseTransform: (
  response: OllamaChatCompleteResponse | OllamaErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && "error" in response) {
    return {
      error: {
        message: response.error,
        type: null,
        param: null,
        code: null,
      },
      provider: OLLAMA,
    } as ErrorResponse;
  }
  if ("model" in response) {
    return {
      id: Date.now().toString(),
      object: "chat.completion",
      created: Date.now(),
      model: response.model,
      provider: OLLAMA,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response.message.content,
          },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: response.prompt_eval_count,
        completion_tokens: response.eval_count,
        total_tokens: response.prompt_eval_count + response.eval_count,
      },
    };
  }
  return {
    error: {
      message: `Invalid response recieved from ${OLLAMA}: ${JSON.stringify(
        response
      )}`,
      type: null,
      param: null,
      code: null,
    },
    provider: OLLAMA,
  } as ErrorResponse;
};

interface OllamaCompleteStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean,
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

export const OllamaChatCompleteStreamChunkTransform: (response: string, fallbackId: string) => string = (resposeChunk, fallbackId) =>{
  let chunk = resposeChunk.trim()
  console.log(chunk);
  
  if(chunk.includes('total_duration')){
    return `data: [DONE]` + `\n\n`;
  }
  const parsedChunk : OllamaCompleteStreamChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: Date.now() ?? fallbackId,
      object: "chat.completion.chunk",
      created: Date.now(),
      model: parsedChunk.model,
      provider: OLLAMA,
      choices: [
        {
          delta: {
            content: parsedChunk.message.content
          },
          index: 0,
          logprobs: null,
          finish_reason: null,
        },
      ]
    })}` + '\n\n'
  )
}