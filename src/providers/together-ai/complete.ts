import { CompletionResponse, ErrorResponse, ProviderConfig } from "../types";

export const TogetherAICompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    required: true,
    default: "togethercomputer/RedPajama-INCITE-7B-Instruct"
  },
  prompt: {
    param: "prompt",
    required: true,
    default: ""
  },
  max_tokens: {
    param: "max_tokens",
    required: true,
    default: 128,
    min: 1,
  },
  stop: {
    param: "stop"
  },
  temperature: {
    param: "temperature"
  },
  top_p: {
    param: "top_p"
  },
  top_k: {
    param: "top_p"
  },
  frequency_penalty: {
    param: "repetition_penalty"
  },
  stream: {
    param: "stream",
    default: false,
  },
  logprobs: {
    param: "logprobs"
  }
};


interface TogetherAICompleteResponse {
  id: string;
  choices: {
    text: string;
  }[];
  created: number;
  model: string;
  object: string;
}

interface TogetherAICompleteErrorResponse {
  model: string;
  job_id: string;
  request_id: string;
  error: string;
}

interface TogetherAICompletionStreamChunk {
  id: string;
  request_id: string;
  choices: {
    text: string;
  }[];
}

export const TogetherAICompleteResponseTransform: (response: TogetherAICompleteResponse | TogetherAICompleteErrorResponse, responseStatus: number) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200) {
      return {
          error: {
              message: 'error' in response ? response.error : "",
              type: null,
              param: null,
              code: null
          },
          provider: "together-ai"
      } as ErrorResponse;
    } 

    if ('choices' in response) {
      return {
        id: response.id,
        object: response.object,
        created: response.created,
        model: response.model,
        provider: "together-ai",
        choices: [
          {
            text: response.choices[0]?.text,
            index: 0,
            logprobs: null,
            finish_reason: "",
          },
        ]
      };
    }

    return {
      error: {
          message: `Invalid response recieved from together-ai: ${JSON.stringify(response)}`,
          type: null,
          param: null,
          code: null
      },
      provider: "together-ai"
    } as ErrorResponse;
  }

export const TogetherAICompleteStreamChunkTransform: (response: string) => string = (responseChunk) => {
    let chunk = responseChunk.trim();
    chunk = chunk.replace(/^data: /, "");
    chunk = chunk.trim();
    if (chunk === '[DONE]') {
      return `data: ${chunk}\n\n`;
    }
    const parsedChunk: TogetherAICompletionStreamChunk= JSON.parse(chunk);
    return `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: "text_completion",
      created: Math.floor(Date.now() / 1000),
      model: "",
      provider: "together-ai",
      choices: [
        {
          text: parsedChunk.choices[0]?.text,
          index: 0,
          finish_reason: "",
        },
      ]
    })}` + '\n\n'
  };