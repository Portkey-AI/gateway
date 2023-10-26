import { CompletionResponse, ErrorResponse, ProviderConfig } from "../types";
import { Params } from "../../types/requestBody";

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const AI21CompleteConfig: ProviderConfig = {
  prompt: {
    param: "prompt",
    required: true,
  },
  n: {
    param: "numResults",
    default: 1,
  },
  max_tokens: {
    param: "maxTokens",
    default: 16,
    min: 0,
  },
  min_tokens: {
    param: "minTokens",
    default: 0,
    min: 0,
  },
  temperature: {
    param: "temperature",
    default: 0.7,
    min: 0,
    max: 2,
  },
  top_k: {
    param: "topKReturn",
    default: 0,
    min: 0,
    max: 10,
  },
  stop: {
    param: "stopSequences",
  },
  frequency_penalty: {
    param: "frequencyPenalty",
    min: 0,
    max: 500,
    default: 0,
    transform: (params: Params) => {
      return {
        scale: params.frequency_penalty,
        applyToNumbers: false,
        applyToPunctuations: false,
        applyToStopwords: false,
        applyToWhitespaces: false,
        applyToEmojis: false,
      };
    },
  },
  presence_penalty: {
    param: "presencePenalty",
    min: 0,
    max: 5.0,
    default: 0,
    transform: (params: Params) => {
      return {
        scale: params.presence_penalty,
        applyToNumbers: false,
        applyToPunctuations: false,
        applyToStopwords: false,
        applyToWhitespaces: false,
        applyToEmojis: false,
      };
    },
  },
  count_penalty: {
    param: "countPenalty",
    min: 0,
    max: 1,
    default: 0,
    transform: (params: Params) => {
      return {
        scale: params.count_penalty,
        applyToNumbers: false,
        applyToPunctuations: false,
        applyToStopwords: false,
        applyToWhitespaces: false,
        applyToEmojis: false,
      };
    },
  },
};

interface TokenData {
  generatedToken: {
    token: string;
    logprob: number;
    raw_logprob: number;
  };
  topTokens?: {
    token: string;
    logprob: number;
  };
  textRange: {
    start: number;
    end: number;
  };
}

interface FinishReason {
  reason: string;
  length: number;
  sequence?: string[];
}

interface CompletionsData {
  text: string;
  tokens: TokenData[];
}

interface AI21CompleteResponse {
  id: string;
  prompt: {
    text: string;
    tokens: TokenData[];
  };
  completions: {
    data: CompletionsData;
    finishReason: FinishReason;
  }[];
}

export const AI21CompleteResponseTransform: (
  response: AI21CompleteResponse,
  responseStatus: number
) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    return {
      error: {
        message: "error",
        type: null,
        param: null,
        code: null,
      },
      provider: "ai21",
    } as ErrorResponse;
  }

  return {
    id: response.id,
    object: "text_completion",
    created: Math.floor(Date.now() / 1000),
    model: "Unknown",
    provider: "ai21",
    choices: response.completions.map((completion, index) => ({
      text: completion.data.text,
      index: index,
      logprobs: null,
      finish_reason: completion.finishReason.reason,
    })),
  };
};
