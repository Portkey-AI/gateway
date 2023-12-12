import { CompletionResponse, ErrorResponse, ProviderConfig } from "../types";
import { AnyscaleStreamChunk } from "./chatComplete";

export const AnyscaleCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    required: true,
    default: "Meta-Llama/Llama-Guard-7b",
  },
  prompt: {
    param: "prompt",
    default: ""
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
  logprobs: {
    param: "logprobs",
    max: 5,
  },
  echo: {
    param: "echo",
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
  best_of: {
    param: "best_of",
  },
  logit_bias: {
    param: "logit_bias",
  },
  user: {
    param: "user",
  },
};

interface AnyscaleCompleteResponse extends CompletionResponse, ErrorResponse {}

export const AnyscaleCompleteResponseTransform: (response: AnyscaleCompleteResponse, responseStatus: number) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
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
    };
  }
  
export const AnyscaleCompleteStreamChunkTransform: (response: string) => string = (responseChunk) => {
    let chunk = responseChunk.trim();
    chunk = chunk.replace(/^data: /, "");
    chunk = chunk.trim();
    if (chunk === '[DONE]') {
      return chunk;
    }
    const parsedChunk: AnyscaleStreamChunk= JSON.parse(chunk);
    return `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: "anyscale",
      choices: [
        {
            text: parsedChunk.choices[0]?.delta?.content ?? "",
            index: parsedChunk.choices[0]?.index,
            logprobs: null,
            finish_reason: parsedChunk.choices[0]?.finish_reason,
          },
      ]
    })}` + '\n\n'
  };