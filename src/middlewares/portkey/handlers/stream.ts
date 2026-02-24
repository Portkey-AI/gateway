import { logger } from '../../../apm';
import {
  ANTHROPIC,
  COHERE,
  GOOGLE,
  PERPLEXITY_AI,
  OLLAMA,
  NOVITA_AI,
  MISTRAL_AI,
  AZURE_OPEN_AI,
  OPEN_AI,
  ANYSCALE,
  TOGETHER_AI,
} from '../../../globals';
import {
  OpenAIResponse,
  ResponseCompletedEvent,
  ResponseErrorEvent,
  ResponseFailedEvent,
  ResponseIncompleteEvent,
  ResponseStreamEvent,
} from '../../../types/modelResponses';
import { MODES } from '../globals';
import {
  CohereStreamResponse,
  GoogleGenerateContentResponse,
  OpenAIStreamResponse,
  ParsedChunk,
  TogetherAIResponse,
  TogetherInferenceResponse,
  OllamaCompleteStreamReponse,
  OllamaChatCompleteStreamResponse,
} from '../types';
import { RESPONSE_CREATED_EVENT } from '../../../providers/open-ai-base/constants';
import { getRandomId } from '../../../providers/open-ai-base/helpers';
import { parseAnthropicMessageStreamResponse } from '../utils/anthropicMessagesStreamParser';
import { endpointStrings } from '../../../providers/types';

export const getStreamModeSplitPattern = (
  proxyProvider: string,
  requestURL: string,
  fn: endpointStrings
) => {
  let splitPattern = '\n\n';
  if (proxyProvider === ANTHROPIC && requestURL.endsWith('complete')) {
    splitPattern = '\r\n\r\n';
  }
  if (proxyProvider === COHERE) {
    splitPattern = '\n';
  }
  if (proxyProvider === GOOGLE) {
    splitPattern = '\r\n';
  }
  if (proxyProvider === PERPLEXITY_AI) {
    splitPattern = '\r\n\r\n';
  }
  if (proxyProvider === OLLAMA) {
    splitPattern = '\n';
  }
  if (fn === 'createTranscription') {
    splitPattern = '\r\n\r\n';
  }
  return splitPattern;
};

function parseOpenAIStreamResponse(
  res: string,
  splitPattern: string,
  isStreamCompletionTokensAllowed: boolean
): OpenAIStreamResponse {
  const arr = res.split(splitPattern);
  const responseObj: OpenAIStreamResponse = {
    id: '',
    object: '',
    created: '',
    choices: [],
    model: '',
    usage: {
      completion_tokens: 0,
    },
  };

  arr.forEach((eachFullChunk) => {
    eachFullChunk = eachFullChunk
      .trim()
      .replace(/^data: /, '')
      .trim();
    if (!eachFullChunk || eachFullChunk === '[DONE]') {
      return responseObj;
    }

    let currentIndex: number = 0;
    try {
      const parsedChunk: Record<string, any> = JSON.parse(
        eachFullChunk || '{}'
      );
      if (parsedChunk['hook_results']) {
        responseObj['hook_results'] = parsedChunk['hook_results'];
      }

      if (parsedChunk.choices && parsedChunk.choices[0]?.index >= 0) {
        currentIndex = parsedChunk.choices[0].index;
      }

      if (parsedChunk.choices?.[0]?.delta) {
        const isEmptyChunk = !parsedChunk.choices[0].delta;
        responseObj.id = parsedChunk.id;
        responseObj.object = parsedChunk.object;
        responseObj.created = parsedChunk.created;
        responseObj.model = parsedChunk.model;
        if (parsedChunk.service_tier !== undefined) {
          responseObj.service_tier = parsedChunk.service_tier;
        }
        if (parsedChunk.system_fingerprint !== undefined) {
          responseObj.system_fingerprint = parsedChunk.system_fingerprint;
        }

        if (!responseObj.choices[currentIndex]) {
          responseObj.choices[currentIndex] = {
            index: '',
            finish_reason: '',
            message: {
              role: 'assistant',
              content: '',
            },
          };
        }

        const currentChoice = responseObj.choices[currentIndex];

        currentChoice.index = parsedChunk.choices[0].index;
        currentChoice.finish_reason = parsedChunk.choices[0].finish_reason;

        if (!isEmptyChunk) {
          const toolCall = parsedChunk.choices[0].delta?.tool_calls?.[0];
          const toolCallIndex = toolCall?.index || 0;

          if (
            parsedChunk.choices[0].delta?.annotations &&
            currentChoice.message
          ) {
            currentChoice.message.annotations =
              parsedChunk.choices[0].delta?.annotations;
          }

          if (
            currentChoice.message &&
            toolCall &&
            !currentChoice.message.tool_calls
          ) {
            currentChoice.message.tool_calls = [];
          }

          if (currentChoice.message && toolCall) {
            const currentToolCall =
              currentChoice.message.tool_calls[toolCallIndex] || {};

            if (toolCall.id) {
              currentToolCall.id = toolCall.id;
            }
            if (toolCall.type) {
              currentToolCall.type = toolCall.type;
            }
            if (toolCall.function) {
              if (!currentToolCall.function) {
                currentToolCall.function = {};
              }
              if (toolCall.function.name) {
                currentToolCall.function.name = toolCall.function.name;
              }
              if (toolCall.function.arguments) {
                currentToolCall.function.arguments =
                  (currentToolCall.function.arguments || '') +
                  toolCall.function.arguments;
              }
            }

            currentChoice.message.tool_calls[toolCallIndex] = currentToolCall;
          }

          const contentBlock =
            parsedChunk.choices[0].delta?.content_blocks?.[0];
          const contentBlockIndex = contentBlock?.index || 0;

          if (
            currentChoice.message &&
            contentBlock &&
            !currentChoice.message.content_blocks
          ) {
            currentChoice.message.content_blocks = [];
          }

          if (currentChoice.message?.content_blocks && contentBlock) {
            const currentContentBlock =
              currentChoice.message.content_blocks[contentBlockIndex] || {};

            if (contentBlock.delta.thinking) {
              if (!currentContentBlock.thinking) {
                currentContentBlock.thinking = '';
                currentContentBlock.type = 'thinking';
              }
              currentContentBlock.thinking += contentBlock.delta.thinking;
            }
            if (contentBlock.delta.signature) {
              if (!currentContentBlock.signature) {
                currentContentBlock.signature = '';
                currentContentBlock.type = 'thinking';
              }
              currentContentBlock.signature += contentBlock.delta.signature;
            }
            if (contentBlock.delta.data) {
              if (!currentContentBlock.data) {
                currentContentBlock.data = '';
                currentContentBlock.type = 'redacted_thinking';
              }
              currentContentBlock.data += contentBlock.delta.data;
            }
            if (contentBlock.delta.text) {
              if (!currentContentBlock.text) {
                currentContentBlock.text = '';
                currentContentBlock.type = 'text';
              }
              currentContentBlock.text += contentBlock.delta.text;
            }

            currentChoice.message.content_blocks[contentBlockIndex] =
              currentContentBlock;
          }

          if (currentChoice.message && parsedChunk.choices[0].delta.content) {
            currentChoice.message.content +=
              parsedChunk.choices[0].delta.content;
            responseObj.usage.completion_tokens++;
          }
          if (parsedChunk.choices[0].groundingMetadata) {
            currentChoice.groundingMetadata =
              parsedChunk.choices[0].groundingMetadata;
          }
        }
      } else if (
        eachFullChunk !== '[DONE]' &&
        parsedChunk.choices?.[0]?.text != null
      ) {
        responseObj.id = parsedChunk.id;
        responseObj.object = parsedChunk.object;
        responseObj.created = parsedChunk.created;
        responseObj.model = parsedChunk.model;
        if (parsedChunk.service_tier !== undefined) {
          responseObj.service_tier = parsedChunk.service_tier;
        }
        if (parsedChunk.system_fingerprint !== undefined) {
          responseObj.system_fingerprint = parsedChunk.system_fingerprint;
        }

        if (!responseObj.choices[currentIndex]) {
          responseObj.choices[currentIndex] = {
            text: '',
            index: '',
            logprobs: '',
            finish_reason: '',
          };
        }
        const currentChoice = responseObj.choices[currentIndex];

        currentChoice.text += parsedChunk.choices[0].text;
        responseObj.usage.completion_tokens++;

        currentChoice.index = parsedChunk.choices[0].index;
        currentChoice.logprobs = parsedChunk.choices[0].logprobs;
        currentChoice.finish_reason = parsedChunk.choices[0].finish_reason;
      }

      // Portkey cache hits adds usage object with completion tokens to each stream chunk.
      // This is done to avoid calculating tokens again for cache hits.
      // If its not present, then increment completion_tokens on each chunk.
      if (parsedChunk.usage && parsedChunk.usage.completion_tokens) {
        responseObj.usage.completion_tokens =
          parsedChunk.usage.completion_tokens;
      }

      // Cache tokens are sent for anthropic as part of prompt-caching feature.
      if (
        parsedChunk.usage &&
        (parsedChunk.usage.cache_read_input_tokens ||
          parsedChunk.usage.cache_creation_input_tokens)
      ) {
        responseObj.usage.cache_read_input_tokens =
          parsedChunk.usage.cache_read_input_tokens;
        responseObj.usage.cache_creation_input_tokens =
          parsedChunk.usage.cache_creation_input_tokens;
      }

      // Anthropic sends prompt and completion tokens in separate chunks
      // So adding 2 different conditions are required for prompt and completion
      if (parsedChunk.usage && parsedChunk.usage.prompt_tokens) {
        responseObj.usage.prompt_tokens = parsedChunk.usage.prompt_tokens;
      }

      if (
        parsedChunk.usage &&
        parsedChunk.usage.prompt_tokens &&
        parsedChunk.usage.completion_tokens
      ) {
        responseObj.usage.prompt_tokens = parsedChunk.usage.prompt_tokens;
        responseObj.usage.completion_tokens =
          parsedChunk.usage.completion_tokens;
        responseObj.usage.total_tokens =
          parsedChunk.usage.total_tokens ??
          parsedChunk.usage.prompt_tokens + parsedChunk.usage.completion_tokens;
        responseObj.usage.num_search_queries =
          parsedChunk.usage.num_search_queries;
      }

      if (parsedChunk.usage?.completion_tokens_details) {
        responseObj.usage.completion_tokens_details =
          parsedChunk.usage.completion_tokens_details;
      }

      if (parsedChunk.usage?.prompt_tokens_details) {
        responseObj.usage.prompt_tokens_details =
          parsedChunk.usage.prompt_tokens_details;
      }

      if (parsedChunk.citations) {
        responseObj.citations = parsedChunk.citations;
      }
    } catch (error: any) {
      logger.error({
        message: `parseOpenAIStreamResponse: ${error.message}`,
      });
    }
  });

  if (!isStreamCompletionTokensAllowed) {
    responseObj.usage.completion_tokens = 0;
  }
  return responseObj;
}

function parseCohereStreamResponse(
  res: string,
  splitPattern: string
): CohereStreamResponse {
  const arr = res.split(splitPattern);
  const responseObj: CohereStreamResponse = {
    id: '',
    generations: [
      {
        id: '',
        text: '',
        finish_reason: '',
      },
    ],
    prompt: '',
  };
  let lastChunk: CohereStreamResponse | undefined;

  arr.forEach((eachFullChunk) => {
    eachFullChunk = eachFullChunk.trim();
    try {
      const parsedChunk: ParsedChunk = JSON.parse(eachFullChunk || '{}');

      if (parsedChunk.is_finished && parsedChunk.response) {
        lastChunk = parsedChunk.response;
      }
    } catch (error: any) {
      logger.error({
        message: `parseCohereStreamResponse: ${error.message}`,
      });
    }
  });

  return lastChunk || responseObj;
}

function parseGoogleStreamResponse(res: string): GoogleGenerateContentResponse {
  const response: GoogleGenerateContentResponse = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: '',
            },
          ],
          role: 'model',
        },
        finishReason: '',
        index: 0,
        safetyRatings: [],
      },
    ],
    promptFeedback: {
      safetyRatings: [],
    },
  };
  try {
    const parsedResponse = JSON.parse(res);
    parsedResponse.forEach((eachChunk: GoogleGenerateContentResponse) => {
      const candidates = eachChunk.candidates;
      if (eachChunk.promptFeedback) {
        response.promptFeedback = eachChunk.promptFeedback;
      }
      candidates.forEach((candidate) => {
        const index = candidate.index;
        if (!response.candidates[index]) {
          response.candidates[index] = {
            content: {
              parts: [
                {
                  text: '',
                },
              ],
              role: 'model',
            },
            finishReason: '',
            index: 0,
            safetyRatings: [],
          };
        }

        response.candidates[index].content.parts[0].text +=
          candidate.content.parts[0]?.text ?? '';
        response.candidates[index].finishReason = candidate.finishReason;
        response.candidates[index].safetyRatings = candidate.safetyRatings;
        response.candidates[index].index = candidate.index;
      });
    });
  } catch (error) {
    console.log('google stream error', error);
  }
  return response;
}

function parseTogetherAIInferenceStreamResponse(
  res: string,
  splitPattern: string
): TogetherInferenceResponse {
  const arr = res.split(splitPattern);
  const responseObj: TogetherInferenceResponse = {
    status: 'finished',
    output: {
      choices: [],
      request_id: '',
    },
  };
  try {
    arr.forEach((eachFullChunk) => {
      eachFullChunk.trim();
      eachFullChunk = eachFullChunk.replace(/^data: /, '');
      eachFullChunk = eachFullChunk.trim();
      let currentIndex: number = 0;
      if (!eachFullChunk || eachFullChunk === '[DONE]') {
        return responseObj;
      }
      const parsedChunk: Record<string, any> = JSON.parse(
        eachFullChunk || '{}'
      );
      if (parsedChunk.choices && parsedChunk.choices[0]?.index >= 0) {
        currentIndex = parsedChunk.choices[0].index;
      }

      if (eachFullChunk !== '[DONE]' && parsedChunk.choices?.[0]?.text) {
        if (!responseObj.output.choices[currentIndex]) {
          responseObj.output.choices[currentIndex || 0] = {
            text: '',
          };
        }
        responseObj.output.choices[currentIndex].text +=
          parsedChunk.choices[0].text;
      }
    });
  } catch (error: any) {
    logger.error({
      message: `parseTogetherAIInferenceStreamResponse: ${error.message}`,
    });
  }
  return responseObj;
}

function parseTogetherAICompletionsStreamResponse(
  res: string,
  splitPattern: string
): TogetherAIResponse {
  const arr = res.split(splitPattern);
  const responseObj: TogetherAIResponse = {
    id: '',
    object: '',
    created: '',
    choices: [],
    model: '',
  };
  try {
    arr.forEach((eachFullChunk) => {
      eachFullChunk.trim();
      eachFullChunk = eachFullChunk.replace(/^data: /, '');
      eachFullChunk = eachFullChunk.trim();
      let currentIndex: number = 0;
      if (!eachFullChunk || eachFullChunk === '[DONE]') {
        return responseObj;
      }
      const parsedChunk: Record<string, any> = JSON.parse(
        eachFullChunk || '{}'
      );
      if (parsedChunk.choices && parsedChunk.choices[0]?.index >= 0) {
        currentIndex = parsedChunk.choices[0].index;
      }

      if (parsedChunk.choices?.[0]?.delta) {
        const isEmptyChunk = parsedChunk.choices[0].delta.content
          ? false
          : true;
        responseObj.id = parsedChunk.id;
        responseObj.object = parsedChunk.object;
        responseObj.created = parsedChunk.created;
        responseObj.model = parsedChunk.model;

        if (!responseObj.choices[currentIndex]) {
          responseObj.choices[currentIndex] = {
            message: {
              role: 'assistant',
              content: '',
            },
          };
        }

        if (!isEmptyChunk) {
          responseObj.choices[currentIndex].message = {
            role: 'assistant',
            content:
              responseObj?.choices?.[currentIndex]?.message?.content +
              parsedChunk.choices[0].delta.content,
          };
        }
      } else if (eachFullChunk !== '[DONE]' && parsedChunk.choices?.[0]?.text) {
        responseObj.id = parsedChunk.id;
        responseObj.object = parsedChunk.object;
        responseObj.created = parsedChunk.created;
        responseObj.model = parsedChunk.model;

        if (!responseObj.choices[currentIndex]) {
          responseObj.choices[currentIndex || 0] = {
            text: '',
          };
        }
        responseObj.choices[currentIndex].text += parsedChunk.choices[0].text;
      }
    });
  } catch (error: any) {
    logger.error({
      message: `parseTogetherAICompletionsStreamResponse: ${error.message}`,
    });
  }
  return responseObj;
}

function parseTogetherAIStreamResponse(
  res: string,
  splitPattern: string,
  requestURL: string
): TogetherAIResponse | TogetherInferenceResponse {
  let responseType = 'completions';
  if (requestURL.endsWith('/inference')) {
    responseType = 'inference';
  }

  switch (responseType) {
    case 'inference':
      return parseTogetherAIInferenceStreamResponse(res, splitPattern);
    default:
      return parseTogetherAICompletionsStreamResponse(res, splitPattern);
  }
}

function parseOllamaStreamResponse(
  res: string,
  splitPattern: string,
  requestURL: string
): OllamaCompleteStreamReponse | OllamaChatCompleteStreamResponse {
  let responseType = 'generate';
  if (requestURL.endsWith('/chat')) {
    responseType = 'chat';
  }
  switch (responseType) {
    case 'chat':
      return parseOllamaChatCompleteStreamResponse(res, splitPattern);
    default:
      return parseOllamaCompleteStreamResponse(res, splitPattern);
  }
}

function parseOllamaCompleteStreamResponse(
  res: string,
  splitPattern: string
): OllamaCompleteStreamReponse {
  const arr = res.split(splitPattern).slice(0, -1);

  const responseObj: OllamaCompleteStreamReponse = {
    model: '',
    created_at: 0,
    response: '',
    done: false,
    context: [],
  };

  for (const eachChunk of arr) {
    eachChunk.trim();
    try {
      const parsedChunk = JSON.parse(eachChunk);
      if (parsedChunk.context) {
        responseObj.model = parsedChunk.model;
        responseObj.created_at = parsedChunk.created_at;
        responseObj.done = parsedChunk.done;
        responseObj.context = parsedChunk.context;
      } else {
        responseObj.response += parsedChunk.response;
      }
    } catch (error: any) {
      logger.error({
        message: `parseOllamaCompleteStreamResponse: ${error.message}`,
      });
    }
  }
  return responseObj;
}

function parseOllamaChatCompleteStreamResponse(
  res: string,
  splitPattern: string
): OllamaChatCompleteStreamResponse {
  const arr = res.split(splitPattern).slice(0, -1);
  const responseObj: OllamaChatCompleteStreamResponse = {
    model: '',
    created_at: '',
    message: {
      role: '',
      content: '',
    },
    done: false,
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: 0,
    prompt_eval_duration: 0,
    eval_count: 0,
    eval_duration: 0,
  };
  for (const eachChunk of arr) {
    eachChunk.trim();
    try {
      const parsedChunk = JSON.parse(eachChunk);
      if (parsedChunk.done) {
        responseObj.model = parsedChunk.model;
        responseObj.created_at = parsedChunk.created_at;
        responseObj.message.role = parsedChunk.message.role;
        responseObj.done = parsedChunk.done;
        responseObj.total_duration = parsedChunk.total_duration;
        responseObj.load_duration = parsedChunk.load_duration;
        responseObj.prompt_eval_count = parsedChunk?.prompt_eval_count;
        responseObj.prompt_eval_duration = parsedChunk.prompt_eval_duration;
        responseObj.eval_count = parsedChunk.eval_count;
        responseObj.eval_duration = parsedChunk.eval_duration;
      } else {
        responseObj.message.content += parsedChunk.message.content;
      }
    } catch (error: any) {
      logger.error({
        message: `parseOllamaChatCompleteStreamResponse: ${error.message}`,
      });
    }
  }

  return responseObj;
}

export function parseResponse(
  res: string,
  aiProvider: string,
  proxyMode: string,
  requestURL: string,
  fn: endpointStrings
) {
  const splitPattern = getStreamModeSplitPattern(aiProvider, requestURL, fn);
  let isStreamCompletionTokensAllowed = true;
  if ([NOVITA_AI, MISTRAL_AI].includes(aiProvider)) {
    isStreamCompletionTokensAllowed = false;
  }
  if (![MODES.PROXY_V2, MODES.PROXY].includes(proxyMode)) {
    if (fn === 'createModelResponse') {
      return parseOpenAIResponsesStreamResponse(res, '\n\n');
    } else if (fn === 'messages') {
      return parseAnthropicMessageStreamResponse(res, splitPattern);
    } else if (fn === 'createTranscription')
      return parseOpenAICreateTranscriptionStreamResponse(res, splitPattern);
    return parseOpenAIStreamResponse(
      res,
      '\n\n',
      isStreamCompletionTokensAllowed
    );
  }
  switch (aiProvider) {
    case AZURE_OPEN_AI:
    case OPEN_AI:
    case ANYSCALE:
    case PERPLEXITY_AI:
      return parseOpenAIStreamResponse(res, splitPattern, true);
    case MISTRAL_AI:
      return parseOpenAIStreamResponse(res, splitPattern, false);
    case ANTHROPIC:
      return parseAnthropicMessageStreamResponse(res, splitPattern);
    case COHERE:
      return parseCohereStreamResponse(res, splitPattern);
    case GOOGLE:
      return parseGoogleStreamResponse(res);
    case TOGETHER_AI:
      return parseTogetherAIStreamResponse(res, splitPattern, requestURL);
    case OLLAMA:
      return parseOllamaStreamResponse(res, splitPattern, requestURL);
    default:
      logger.error({
        message: `parseResponse invalid provider error: ${aiProvider}`,
      });
      return {};
  }
}

export async function* readStream(
  reader: ReadableStreamDefaultReader,
  splitPattern: string,
  transformFunction: Function | undefined
) {
  let buffer = '';
  const decoder = new TextDecoder();
  const state = {
    lastIndex: 0,
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.length > 0) {
        if (transformFunction) {
          yield transformFunction(buffer, state);
        } else {
          yield buffer;
        }
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    // keep buffering until we have a complete chunk

    while (buffer.split(splitPattern).length > 1) {
      const parts = buffer.split(splitPattern);
      const lastPart = parts.pop() ?? ''; // remove the last part from the array and keep it in buffer
      for (const part of parts) {
        if (part.length > 0) {
          if (transformFunction) {
            yield transformFunction(part, state);
          } else {
            yield part + splitPattern;
          }
        }
      }

      buffer = lastPart; // keep the last part (after the last '\n\n') in buffer
    }
  }
}

// currently this function expects the response stream to have either error or response.completed event
// we store the response.completed event which contains the final response
export function parseOpenAIResponsesStreamResponse(
  res: string,
  splitPattern: string
): OpenAIResponse {
  let finalResponseChunk:
    | ResponseCompletedEvent
    | ResponseIncompleteEvent
    | ResponseFailedEvent
    | ResponseErrorEvent
    | undefined;
  for (let chunk of res.split(splitPattern)) {
    chunk = chunk
      .replace(/^event:.*\n?/gm, '')
      .trim()
      .replace(/^data: /, '')
      .trim();

    const obj: ResponseStreamEvent = JSON.parse(chunk);
    if (
      obj.type === 'error' ||
      obj.type === 'response.completed' ||
      obj.type === 'response.failed' ||
      obj.type === 'response.incomplete'
    ) {
      finalResponseChunk = obj;
      break;
    }
  }
  if (!finalResponseChunk) {
    throw new Error('Invalid response');
  }
  if (finalResponseChunk.type === 'error') {
    const response: OpenAIResponse = { ...RESPONSE_CREATED_EVENT.response };
    response.id = getRandomId();
    response.created_at = Math.floor(Date.now() / 1000);
    response.error = {
      code: finalResponseChunk.code ?? 'server_error',
      message: finalResponseChunk.message,
    };
    return response;
  }

  return finalResponseChunk.response;
}

export function parseOpenAICreateTranscriptionStreamResponse(
  res: string,
  splitPattern: string
) {
  const arr = res.split(splitPattern);
  let responseObj: any;
  for (let i = arr.length - 1; i >= 0; i--) {
    let chunk = arr[i];
    chunk = chunk.replace(/^data: /, '').trim();
    if (chunk === '[DONE]' || !chunk.length) {
      continue;
    }
    const parsedChunk = JSON.parse(chunk);
    if (parsedChunk.type === 'transcript.text.done') {
      responseObj = parsedChunk;
      break;
    }
  }
  delete responseObj?.type;
  return responseObj ?? {};
}
