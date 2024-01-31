import { ChatCompletionResponse, ProviderConfig } from "../types";
import { Params } from "../../types/requestBody";
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

interface OllamaChatCompleteResponse extends ChatCompletionResponse {}

export const OllamaChatCompleteResponseTransform: (
  response: OllamaChatCompleteResponse
) => ChatCompletionResponse = (response) => response;
