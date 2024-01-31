import { TOGETHER_AI } from "../../globals";
import { ChatCompletionResponse, ErrorResponse, ProviderConfig } from "../types";

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const TogetherAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    required: true,
    default: "togethercomputer/RedPajama-INCITE-Chat-3B-v1"
  },
  messages: {
    param: "messages",
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
    param: "top_k"
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
  },
  tools: {
    param: "tools"
  },
  tool_choice: {
    param: "tool_choice"
  },
  response_format: {
    param: "response_format"
  },
};

export interface TogetherAIChatCompleteResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
  }[];
  created: number;
  model: string;
  object: string;
}

export interface TogetherAIErrorResponse {
  model: string;
  job_id: string;
  request_id: string;
  error: string;
  message?: string;
  type?: string;
}

export interface TogetherAIChatCompletionStreamChunk {
  id: string;
  request_id: string;
  object: string;
  choices: {
    index: number;
    delta: {
      content: string;
    };
  }[];
}

export const TogetherAIChatCompleteResponseTransform: (response: TogetherAIChatCompleteResponse | TogetherAIErrorResponse, responseStatus: number) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
    if ('error' in response && responseStatus !== 200) {
      return {
          error: {
              message: response.error,
              type: null,
              param: null,
              code: null
          },
          provider: TOGETHER_AI
      } as ErrorResponse;
    } 

    if ('message' in response && responseStatus !== 200) {
      return {
          error: {
              message: response.message,
              type: response.type,
              param: null,
              code: null
          },
          provider: TOGETHER_AI
      } as ErrorResponse;
    } 
    
    if ('choices' in response) {
      return {
        id: response.id,
        object: response.object,
        created: response.created,
        model: response.model,
        provider: TOGETHER_AI,
        choices: [
          {
            message: {"role": "assistant", content: response.choices[0]?.message.content},
            index: 0,
            logprobs: null,
            finish_reason: "",
          }
        ],
        usage: {
          prompt_tokens: -1,
          completion_tokens: -1,
          total_tokens: -1
        }
      }
    }
    return {
      error: {
          message: `Invalid response recieved from together-ai: ${JSON.stringify(response)}`,
          type: null,
          param: null,
          code: null
      },
      provider: TOGETHER_AI
    } as ErrorResponse;
  }
    
  
  export const TogetherAIChatCompleteStreamChunkTransform: (response: string) => string = (responseChunk) => {
    let chunk = responseChunk.trim();
    chunk = chunk.replace(/^data: /, "");
    chunk = chunk.trim();
    if (chunk === '[DONE]') {
      return `data: ${chunk}\n\n`;
    }
    const parsedChunk: TogetherAIChatCompletionStreamChunk = JSON.parse(chunk);
    return `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: Math.floor(Date.now() / 1000),
      model: "",
      provider: TOGETHER_AI,
      choices: [
        {
          delta: {
            content: parsedChunk.choices[0]?.delta.content
          },
          index: 0,
          finish_reason: "",
        }
      ]
    })}` + '\n\n'
  };