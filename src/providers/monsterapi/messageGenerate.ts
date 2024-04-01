import { ParameterConfig, ProviderConfig } from "../types";

export const MessageGenerateConfig: ProviderConfig = {
  messages: {
    param: "messages",
    required: true,
  },
  top_k: {
    param: "top_k",
    min: 1,
    default: 121,
  },
  top_p: {
    param: "top_p",
    min: 0,
    max: 1,
    default: 0.5,
  },
  temp: {
    param: "temp",
    default: 0.65,
  },
  max_length: {
    param: "max_length",
    min: 1,
    default: 128,
  },
  repetition_penalty: {
    param: "repetition_penalty",
    default: 1.2,
  },
  beam_size: {
    param: "beam_size",
    min: 1,
    default: 1,
  },
  model: {
    param: "model",
    required: true,
  },
};
