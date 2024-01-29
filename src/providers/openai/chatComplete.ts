import { ChatCompletionResponse, ProviderConfig } from "../types";

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const OpenAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: "model",
    required: true,
    default: "gpt-3.5-turbo",
  },
  messages: {
    param: "messages",
    default: "",
  },
  functions: {
    param: "functions",
  },
  function_call: {
    param: "function_call",
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
  logit_bias: {
    param: "logit_bias",
  },
  user: {
    param: "user",
  },
  seed: {
    param: "seed"
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
  logprobs: {
    param: "logprobs",
    default: false
  },
  top_logprobs: {
    param: "top_logprobs"
  }
};

export interface OpenAIChatCompleteResponse extends ChatCompletionResponse {
  system_fingerprint: string;
}

export const OpenAIChatCompleteResponseTransform: (response: OpenAIChatCompleteResponse) => ChatCompletionResponse = (response) => response;

/**
 * Transforms an OpenAI-format chat completions JSON response into an array of formatted OpenAI compatible text/event-stream chunks.
 *
 * @param {Object} response - The OpenAIChatCompleteResponse object.
 * @param {string} provider - The provider string.
 * @returns {Array<string>} - An array of formatted stream chunks.
 */
export const OpenAIChatCompleteJSONToStreamResponseTransform: (response: OpenAIChatCompleteResponse, provider: string) => Array<string> = (response, provider) => {
  const streamChunkArray: Array<string> = [];
  const { id, model, system_fingerprint, choices } = response;
  const streamChunkTemplate = {
    id,
    object: "chat.completion.chunk",
    created: Date.now(),
    model: model || "",
    system_fingerprint: system_fingerprint || null,
    provider,
    usage: {}
  }

  if (response.usage?.completion_tokens) {
    streamChunkTemplate.usage = {
      completion_tokens: response.usage?.completion_tokens
    }
  }

  for (const [index, choice] of choices.entries()) {
    if (choice.message && choice.message.tool_calls) {
      const currentToolCall = choice.message.tool_calls[0];
      const toolCallNameChunk = {
        index: 0,
        id: currentToolCall.id,
        type: "function",
        function: {
          name: currentToolCall.function.name,
          arguments: ""
        }
      }

      const toolCallArgumentChunk = {
        index: 0,
        function: {
          arguments: currentToolCall.function.arguments
        }
      }

      streamChunkArray.push(`data: ${JSON.stringify({
        ...streamChunkTemplate,
        choices: [
          {
            index: index,
            delta: {
              role: "assistant",
              content: null,
              tool_calls: [toolCallNameChunk]
            }
          }
        ]
      })}\n\n`)

      streamChunkArray.push(`data: ${JSON.stringify({
        ...streamChunkTemplate,
        choices: [
          {
            index: index,
            delta: {
              role: "assistant",
              tool_calls: [toolCallArgumentChunk]
            }
          }
        ]
      })}\n\n`)
    }

    if (choice.message && choice.message.content && typeof choice.message.content === "string") {
      const inidividualWords: Array<string> = [];
      for (let i = 0; i < choice.message.content.length; i += 4) {
        inidividualWords.push(choice.message.content.slice(i, i+4));
      }
      inidividualWords.forEach((word: string) => {
        streamChunkArray.push(`data: ${JSON.stringify({
          ...streamChunkTemplate,
          choices: [
            {
              index: index,
              delta: {
                role: "assistant",
                content: word
              }
            }
          ]
        })
      }\n\n`)}) 
    }

    streamChunkArray.push(`data: ${JSON.stringify({
      ...streamChunkTemplate,
      choices: [
        {
          index: index,
          delta: {},
          finish_reason: choice.finish_reason
        }
      ]
    })}\n\n`)
  }

  streamChunkArray.push(`data: [DONE]\n\n`)
  return streamChunkArray;
}
