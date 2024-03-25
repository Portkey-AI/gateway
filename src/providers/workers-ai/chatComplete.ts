import {WORKERS_AI} from "../../globals";
import { Params, Message } from "../../types/requestBody";
import { ChatCompletionResponse, ErrorResponse, ProviderConfig } from "../types";

export const WorkersAiChatCompleteConfig: ProviderConfig = {
  messages: [
    {
      param: "messages",
      required: true,
      transform: (params:Params) => {
        let messages:Message[] = [];
        // Transform the chat messages into a simple prompt
        if (!!params.messages) {
          params.messages.forEach(msg => {
            if (msg.content && typeof msg.content === "object" && msg.content.length) {
              const transformedMessage: Record<string, any> = {
                role: msg.role,
                content: [],
              };
              msg.content.forEach(item => {
                if (item.type === "text") {
                  transformedMessage.content.push({ type: item.type, text: item.text });
                } else if (item.type === "image_url" && item.image_url && item.image_url.url) {
                  const parts = item.image_url.url.split(";");
                  if (parts.length === 2) {
                    const base64ImageParts = parts[1].split(",");
                    const base64Image = base64ImageParts[1];
                    const mediaTypeParts = parts[0].split(":");
                    if (mediaTypeParts.length === 2 && base64Image) {
                      const mediaType = mediaTypeParts[1];
                      transformedMessage.content.push({
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: mediaType,
                          data: base64Image,
                        },
                      });
                    }
                  }
                }
              });
              messages.push(transformedMessage as Message);
            } else {
              messages.push({
                role: msg.role,
                content: msg.content
              });
            }
          })
        }

        return messages;
      }
    }
  ],
  stream: {
    param: "stream",
    default: false,
  },
};

export interface WorkersAiErrorObject {
  type: string;
  message: string;
}

interface WorkersAiErrorResponse {
  type: string;
  error: WorkersAiErrorObject;
}

interface WorkersAiChatCompleteResponse {
  result: {
    response: string
  },
  success: boolean,
  errors: string[],
  messages: string[]
}

interface WorkersAiChatCompleteStreamResponse {
  response: string
  p?: string
}

// TODO: cloudflare do not return the usage
// TODO: return the model
export const WorkersAiChatCompleteResponseTransform: (response: WorkersAiChatCompleteResponse | WorkersAiErrorResponse, responseStatus: number) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
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

  if ('result' in response) {
    // const { input_tokens = 0, output_tokens = 0 } = {};

    return {
      id: Date.now().toString(),
      object: "chat_completion",
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: WORKERS_AI,
      choices: [
        {
          message: {"role": "assistant", content: response.result.response},
          index: 0,
          logprobs: null,
          finish_reason: '',
        },
      ],
      // usage: {
      //   prompt_tokens: input_tokens,
      //   completion_tokens: output_tokens,
      //   total_tokens: input_tokens + output_tokens,
      // },
    }
  }

  return {
    error: {
        message: `Invalid response received from WorkersAi: ${JSON.stringify(response)}`,
        type: null,
        param: null,
        code: null
    },
    provider: WORKERS_AI
  } as ErrorResponse;
}


export const WorkersAiChatCompleteStreamChunkTransform: (response: string, fallbackId: string) => string | undefined = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();

  if (chunk.startsWith("data: [DONE]")) {
    return "data: [DONE]\n\n"
  }

  chunk = chunk.replace(/^data: /, "");
  chunk = chunk.trim();

  const parsedChunk: WorkersAiChatCompleteStreamResponse = JSON.parse(chunk);
  return `data: ${JSON.stringify({
    id: fallbackId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "",
    provider: WORKERS_AI,
    choices: [
      {
        delta: {
          content: parsedChunk.response
        },
        index: 0,
        logprobs: null,
        finish_reason: null,
      },
    ]
  })}` + '\n\n'
};
