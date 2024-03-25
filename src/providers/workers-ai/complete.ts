import { Params } from "../../types/requestBody";
import { CompletionResponse, ErrorResponse, ProviderConfig } from "../types";
import { WorkersAiErrorObject } from "./chatComplete";
import {WORKERS_AI} from "../../globals";

export const WorkersAiCompleteConfig: ProviderConfig = {
  prompt: {
    param: "prompt",
    transform: (params: Params) => `\n\nHuman: ${params.prompt}\n\nAssistant:`,
    required: true,
  },
  stream: {
    param: "stream",
    default: false,
  },
};

interface WorkersAiCompleteResponse {
  result: {
    response: string
  },
  success: boolean,
  errors: string[],
  messages: string[]
}

interface WorkersAiCompleteStreamResponse {
  response: string
  p?: string
}

export const WorkersAiCompleteResponseTransform: (response: WorkersAiCompleteResponse, responseStatus: number) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'errors' in response) {
    return {
      error: {
        message: response.errors?.join(','),
        type: null,
        param: null,
        code: null
      },
      provider: WORKERS_AI
    } as ErrorResponse;
  }

  return {
    id: Date.now().toString(),
    object: "text_completion",
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: WORKERS_AI,
    choices: [
      {
        text: response.result.response,
        index: 0,
        logprobs: null,
        finish_reason: '',
      },
    ]
  };
}

export const WorkersAiCompleteStreamChunkTransform: (response: string) => string | undefined = (responseChunk) => {
  let chunk = responseChunk.trim();

  if (chunk.startsWith("data: [DONE]")) {
    return "data: [DONE]\n\n"
  }

  chunk = chunk.replace(/^data: /, "");
  chunk = chunk.trim();

  const parsedChunk: WorkersAiCompleteStreamResponse = JSON.parse(chunk);
  return `data: ${JSON.stringify({
    id: '',
    object: "text_completion",
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: WORKERS_AI,
    choices: [
      {
        text: parsedChunk.response,
        index: 0,
        logprobs: null,
        finish_reason: '',
      },
    ]
  })}` + '\n\n'
};
