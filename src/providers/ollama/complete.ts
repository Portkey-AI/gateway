import { CompletionResponse, ErrorResponse, ProviderConfig } from "../types";
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

export const OllamaCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
  },
  prompt: {
    param: "prompt",
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

interface OllamaCompleteResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context: number[];
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

interface OllamaCompleteStreamChunk {
  model: string;
  create_at: number;
  response: string;
  done: boolean;
  context: number[];
}

export const OllamaCompleteResponseTransform: (
  response: OllamaCompleteResponse | OllamaErrorResponse,
  responseStatus: number
) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
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

  if ("response" in response) {
    return {
      id: Date.now().toString(),
      object: "text_completion",
      created: Date.now(),
      model: response.model,
      provider: OLLAMA,
      choices: [
        {
          text: response.response,
          index: 0,
          logprobs: null,
          finish_reason: "length",
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

export const OllamaCompleteStreamChunkResponseTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  if (chunk.includes("context")) {
    return `data: [DONE]` + `\n\n`;
  }
  const parsedChunk: OllamaCompleteResponse = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: Date.now(),
      object: "text_completion",
      created: Date.now(),
      model: parsedChunk.model,
      provider: OLLAMA,
      choices: [
        {
          text: parsedChunk.response,
          index: 0,
          logprobs: null,
          finish_reason: null,
        },
      ],
    })}` + "\n\n"
  );
};
