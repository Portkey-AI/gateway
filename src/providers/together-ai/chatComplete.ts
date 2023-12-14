import { Message, Params } from "../../types/requestBody";
import { ChatCompletionResponse, ErrorResponse, ProviderConfig } from "../types";
import {TogetherAICompleteErrorResponse, TogetherAICompleteResponse, TogetherAICompletionStreamChunk } from "./complete";

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const TogetherAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    required: true,
    default: "togethercomputer/RedPajama-INCITE-Chat-3B-v1"
  },
  messages: {
    param: "prompt",
    required: true,
    default: "",
    transform: (params: Params) => {
      let prompt: string = "";
      // Transform the chat messages into a simple prompt
      if (!!params.messages) {
        let messages: Message[] = params.messages;
        messages.forEach(msg => {
          if (msg.role === "system") {
            prompt+=`Background: ${msg.content}.\n`
          } else if (msg.role === "assistant") {
            prompt+=`<bot>: ${msg.content}.\n`
          } else {
            prompt+=`<human>: ${msg.content}.\n`
          }
        })
        prompt += "<bot>: "
        prompt = prompt.trim();
      }

      return prompt;
    }
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

export const TogetherAIChatCompleteResponseTransform: (response: TogetherAICompleteResponse | TogetherAICompleteErrorResponse, responseStatus: number) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200) {
      return {
          error: {
              message: 'error' in response ? response.error : null,
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
            message: {"role": "assistant", content: response.choices[0].text},
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
      provider: "together-ai"
    } as ErrorResponse;
  }
    
  
  export const TogetherAIChatCompleteStreamChunkTransform: (response: string) => string = (responseChunk) => {
    let chunk = responseChunk.trim();
    chunk = chunk.replace(/^data: /, "");
    chunk = chunk.trim();
    if (chunk === '[DONE]') {
      return `data: ${chunk}\n\n`;
    }
    const parsedChunk: TogetherAICompletionStreamChunk = JSON.parse(chunk);
    return `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: "text_completion",
      created: Math.floor(Date.now() / 1000),
      model: "",
      provider: "together-ai",
      choices: [
        {
          delta: {
            content: parsedChunk.choices[0]?.text
          },
          index: 0,
          logprobs: null,
          finish_reason: "",
        }
      ]
    })}` + '\n\n'
  };