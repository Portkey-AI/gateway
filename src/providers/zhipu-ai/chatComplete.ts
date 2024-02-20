import { ChatCompletionResponse, ProviderConfig } from "../types";

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const ZhiPuAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    required: true,
    default: "glm-3-turbo",
  },
  messages: {
    param: "messages",
    default: "",
  },
  request_id: {
    param: "request_id",
    default: "",
  },
  do_sample: {
    param: "do_sample",
    default: "",
  },
  max_tokens: {
    param: "max_tokens",
    default: 100,
    min: 0,
  },
  temperature: {
    param: "temperature",
    default: 0.95,
    min: 0,
    max: 1,
  },
  top_p: {
    param: "top_p",
    default: 0.7,
    min: 0,
    max: 1,
  },
  stream: {
    param: "stream",
    default: false,
  },
  stop: {
    param: "stop",
  },
  tools: {
    param: "tools"
  },
  tool_choice: {
    param: "tool_choice"
  }
};
