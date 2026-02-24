import { HookEventType, PluginContext, PluginHandlerOptions } from './types';

interface PostOptions extends RequestInit {
  headers?: Record<string, string>;
  [key: string]: any;
}

// Module-level storage for plugin helpers
const pluginHelpers: Partial<PluginHandlerOptions> = {};

/**
 * Sets the plugin handler options for use by utility functions like post().
 * This is automatically called by the hooks middleware before executing plugin handlers.
 * @param options - The PluginHandlerOptions passed to the plugin handler
 */
export function setPluginHelpers(options: PluginHandlerOptions): void {
  pluginHelpers.env = options.env;
  pluginHelpers.getFromCacheByKey = options.getFromCacheByKey;
  pluginHelpers.putInCacheWithValue = options.putInCacheWithValue;
  pluginHelpers.internalServiceFetch = options.internalServiceFetch;
  pluginHelpers.externalServiceFetch = options.externalServiceFetch;
}

export interface ErrorResponse {
  status: number;
  statusText: string;
  body: string;
  headers?: Headers;
}

export class HttpError extends Error {
  response: ErrorResponse;

  constructor(message: string, response: ErrorResponse) {
    super(message);
    this.name = 'HttpError';
    this.response = response;
  }
}

export class TimeoutError extends Error {
  url: string;
  timeout: number;
  method: string;

  constructor(message: string, url: string, timeout: number, method: string) {
    super(message);
    this.name = 'TimeoutError';
    this.url = url;
    this.timeout = timeout;
    this.method = method;
  }
}

/**
 * Helper function to get the text from the current content part of a request/response context
 * @param context - The plugin context containing request/response data
 * @param eventType - The type of hook event (beforeRequestHook or afterRequestHook)
 * @returns The text from the current content part of the request/response context
 */
export const getText = (
  context: PluginContext,
  eventType: HookEventType
): string => {
  return getCurrentContentPart(context, eventType)
    .textArray.filter((text) => text)
    .join('\n');
};

/**
 * Extracts the current content and its text representation from a request/response context
 * @param context - The plugin context containing request/response data
 * @param eventType - The type of hook event (beforeRequestHook or afterRequestHook)
 * @returns An object containing the raw content and an array of extracted text strings
 */
export const getCurrentContentPart = (
  context: PluginContext,
  eventType: HookEventType
): {
  content: Array<any> | string | Record<string, any> | null;
  textArray: Array<string>;
} => {
  // Determine if we're handling request or response data
  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  const json = context[target].json;

  if (target === 'request') {
    return getRequestContentPart(json, context.requestType!);
  } else {
    return getResponseContentPart(json, context.requestType || '');
  }
};

const getRequestContentPart = (json: any, requestType: string) => {
  let content: Array<any> | string | Record<string, any> | null = null;
  let textArray: Array<string> = [];
  if (requestType === 'chatComplete' || requestType === 'messages') {
    content = json.messages[json.messages.length - 1].content;
    textArray = Array.isArray(content)
      ? content.map((item: any) => item.text || '')
      : [content];
  } else if (requestType === 'complete') {
    content = json.prompt;
    textArray = Array.isArray(content)
      ? content.map((item: any) => item)
      : [content];
  } else if (requestType === 'embed') {
    content = json.input;
    textArray = Array.isArray(content) ? content : [content];
  } else if (requestType === 'createModelResponse') {
    content = json.input;
    textArray = extractTextFromResponsesApiInput(json.input);
  }
  return { content, textArray };
};

const extractTextFromResponsesApiInput = (input: any): Array<string> => {
  if (!input) {
    return [];
  }
  if (typeof input === 'string') {
    return [input];
  }
  if (Array.isArray(input)) {
    const textArray: string[] = [];
    for (const item of input) {
      if (
        (item.type === 'message' || item.role) &&
        typeof item.content === 'string'
      ) {
        textArray.push(item.content);
      } else if (
        (item.type === 'message' || item.role) &&
        Array.isArray(item.content)
      ) {
        for (const contentPart of item.content) {
          if (
            contentPart.type === 'input_text' ||
            contentPart.type === 'text'
          ) {
            textArray.push(contentPart.text || '');
          }
        }
      } else if (item.type === 'function_call_output' && item.output) {
        textArray.push(item.output);
      }
    }
    return textArray;
  }
  return [];
};

const getResponseContentPart = (json: any, requestType: string) => {
  let content: Array<any> | string | Record<string, any> | null = null;
  let textArray: Array<string> = [];

  // This can happen for streaming mode.
  if (!json) {
    return { content: null, textArray: [] };
  }

  if (requestType === 'chatComplete') {
    content = json.choices[0].message.content as string;
    textArray = [content];
  } else if (requestType === 'complete') {
    content = json.choices[0].text as string;
    textArray = [content];
  } else if (requestType === 'messages') {
    content = json.content;
    textArray = (content as Array<any>).map((item: any) => item.text || '');
  } else if (requestType === 'createModelResponse') {
    content = json.output;
    textArray = extractTextFromResponsesApiOutput(json.output);
  }
  return { content, textArray };
};

const extractTextFromResponsesApiOutput = (output: any): Array<string> => {
  if (!output || !Array.isArray(output)) {
    return [];
  }
  const textArray: string[] = [];
  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const contentPart of item.content) {
        if (contentPart.type === 'output_text' || contentPart.type === 'text') {
          textArray.push(contentPart.text || '');
        } else if (contentPart.type === 'refusal') {
          textArray.push(contentPart.refusal || '');
        }
      }
    } else if (item.type === 'reasoning') {
      if (Array.isArray(item.content)) {
        for (const contentPart of item.content) {
          textArray.push(contentPart.text || '');
        }
      } else if (item.content?.text) {
        textArray.push(item.content.text);
      }
    }
  }
  return textArray;
};

/**
 * Updates the content of a request or response in the plugin context
 * @param context - The plugin context containing request/response data
 * @param eventType - The type of hook event (beforeRequestHook or afterRequestHook)
 * @param newContent - New content to set (can be string, array, or object)
 * @param textArray - Optional array of text strings to update text fields
 */
export const setCurrentContentPart = (
  context: PluginContext,
  eventType: HookEventType,
  transformedData: Record<string, any>,
  textArray: Array<string | null> | null = null
): void => {
  const requestType = context.requestType;
  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  const json = context[target].json;

  if (textArray?.length === 0 || !textArray) {
    return;
  }

  if (target === 'request') {
    setRequestContentPart(json, requestType!, textArray, transformedData);
  } else {
    setResponseContentPart(json, requestType!, textArray, transformedData);
  }
};

function setRequestContentPart(
  json: any,
  requestType: string,
  textArray: Array<string | null>,
  transformedData: Record<string, any>
) {
  // Create a safe to use shallow copy of the json
  const updatedJson = { ...json };

  if (requestType === 'chatComplete' || requestType === 'messages') {
    updatedJson.messages = [...json.messages];
    const lastMessage = {
      ...updatedJson.messages[updatedJson.messages.length - 1],
    };
    const originalContent = lastMessage.content;
    if (Array.isArray(originalContent)) {
      lastMessage.content = originalContent.map((item: any, index: number) => ({
        ...item,
        text: textArray[index] || item.text,
      }));
    } else {
      lastMessage.content = textArray[0] || originalContent;
    }
    updatedJson.messages[updatedJson.messages.length - 1] = lastMessage;
  } else if (requestType === 'complete') {
    updatedJson.prompt = Array.isArray(updatedJson.prompt)
      ? textArray.map((text, index) => text || updatedJson.prompt[index])
      : textArray[0];
  } else if (requestType === 'createModelResponse') {
    updatedJson.input = transformResponsesApiInput(json.input, textArray);
  }
  transformedData.request.json = updatedJson;
}

function transformResponsesApiInput(
  input: string | Array<any>,
  textArray: Array<string | null>
) {
  if (!input) {
    return input;
  }
  if (typeof input === 'string') {
    return textArray[0] || input;
  }
  if (Array.isArray(input)) {
    let textIndex = 0;
    return input.map((item: any) => {
      const updatedItem = { ...item };
      if (
        (item.type === 'message' || item.role) &&
        typeof item.content === 'string'
      ) {
        updatedItem.content = textArray[textIndex] ?? item.content;
        textIndex++;
      } else if (
        (item.type === 'message' || item.role) &&
        Array.isArray(item.content)
      ) {
        updatedItem.content = item.content.map((contentPart: any) => {
          if (
            contentPart.type === 'input_text' ||
            contentPart.type === 'text'
          ) {
            const updatedPart = {
              ...contentPart,
              text: textArray[textIndex] ?? contentPart.text,
            };
            textIndex++;
            return updatedPart;
          }
          return contentPart;
        });
      } else if (item.type === 'function_call_output' && item.output) {
        updatedItem.output = textArray[textIndex] ?? item.output;
        textIndex++;
      }
      return updatedItem;
    });
  }
  return input;
}

function setResponseContentPart(
  json: any,
  requestType: string,
  textArray: Array<string | null>,
  transformedData: Record<string, any>
) {
  // Create a safe to use shallow copy of the json
  const updatedJson = { ...json };

  if (requestType === 'chatComplete') {
    updatedJson.choices = [...json.choices];
    const firstChoice = {
      ...updatedJson.choices[0],
    };
    firstChoice.message = {
      ...firstChoice.message,
      content: textArray[0] || firstChoice.message.content,
    };
    updatedJson.choices[0] = firstChoice;
  } else if (requestType === 'complete') {
    updatedJson.choices = [...json.choices];
    updatedJson.choices[json.choices.length - 1].text =
      textArray[0] || json.choices[json.choices.length - 1].text;
  } else if (requestType === 'messages') {
    updatedJson.content = textArray.map(
      (text, index) => text || updatedJson.content[index]
    );
  } else if (requestType === 'createModelResponse') {
    updatedJson.output = transformResponsesApiOutput(json.output, textArray);
  }
  transformedData.response.json = updatedJson;
}

function transformResponsesApiOutput(
  output: any,
  textArray: Array<string | null>
): any {
  if (!output || !Array.isArray(output)) {
    return output;
  }
  let textIndex = 0;
  return output.map((item) => {
    const updatedItem = { ...item };
    if (item.type === 'message' && Array.isArray(item.content)) {
      updatedItem.content = item.content.map((contentPart: any) => {
        if (contentPart.type === 'output_text' || contentPart.type === 'text') {
          const updatedPart = {
            ...contentPart,
            text: textArray[textIndex] ?? contentPart.text,
          };
          textIndex++;
          return updatedPart;
        } else if (contentPart.type === 'refusal') {
          const updatedPart = {
            ...contentPart,
            refusal: textArray[textIndex] ?? contentPart.refusal,
          };
          textIndex++;
          return updatedPart;
        }
        return contentPart;
      });
    } else if (item.type === 'reasoning') {
      if (Array.isArray(item.content)) {
        updatedItem.content = item.content.map((contentPart: any) => {
          const updatedPart = {
            ...contentPart,
            text: textArray[textIndex] ?? contentPart.text,
          };
          textIndex++;
          return updatedPart;
        });
      } else if (item.content?.text) {
        updatedItem.content = {
          ...item.content,
          text: textArray[textIndex] ?? item.content.text,
        };
        textIndex++;
      }
    }
    return updatedItem;
  });
}

/**
 * Sends a POST request to the specified URL with the given data and timeout.
 * @param url - The URL to send the POST request to.
 * @param data - The data to be sent in the request body.
 * @param options - Additional options for the fetch call.
 * @param timeout - Timeout in milliseconds (default: 5 seconds).
 * @returns A promise that resolves to the JSON response.
 * @throws {HttpError} Throws an HttpError with detailed information if the request fails.
 * @throws {Error} Throws a generic Error for network issues or timeouts.
 */
export async function post<T = any>(
  url: string,
  data: any,
  options: PostOptions = {},
  timeout: number = 5000
): Promise<T> {
  if (!pluginHelpers.externalServiceFetch) {
    throw new Error(
      'externalServiceFetch is not available. This seems like a bug in the hooks middleware.'
    );
  }
  const defaultOptions: PostOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };

  const mergedOptions: PostOptions = { ...defaultOptions, ...options };

  if (mergedOptions.headers) {
    mergedOptions.headers = {
      ...defaultOptions.headers,
      ...mergedOptions.headers,
    };
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const response: Response = await pluginHelpers.externalServiceFetch(url, {
      ...mergedOptions,
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch (e) {
        errorBody = 'Unable to retrieve response body';
      }

      const errorResponse: ErrorResponse = {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        headers: response.headers,
      };

      throw new HttpError(
        `HTTP error! status: ${response.status}`,
        errorResponse
      );
    }

    return (await response.json()) as T;
  } catch (error: any) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error.name === 'AbortError') {
      throw new TimeoutError(
        `Request timed out after ${timeout}ms`,
        url,
        timeout,
        mergedOptions.method || 'POST'
      );
    }
    // console.error('Error in post request:', error);
    throw error;
  }
}

/**
 * Sends a POST request to the specified URL with the given data and timeout.
 * @param url - The URL to send the POST request to.
 * @param data - The data to be sent in the request body.
 * @param options - Additional options for the fetch call.
 * @param timeout - Timeout in milliseconds (default: 5 seconds).
 * @returns A promise that resolves to the JSON response.
 * @throws {HttpError} Throws an HttpError with detailed information if the request fails.
 * @throws {Error} Throws a generic Error for network issues or timeouts.
 */
export async function postWithCloudflareServiceBinding<T = any>(
  url: string,
  data: any,
  serviceBinding: any,
  options: PostOptions = {},
  timeout: number = 5000
): Promise<T> {
  const defaultOptions: PostOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };

  const mergedOptions: PostOptions = { ...defaultOptions, ...options };

  if (mergedOptions.headers) {
    mergedOptions.headers = {
      ...defaultOptions.headers,
      ...mergedOptions.headers,
    };
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const response: Response = await serviceBinding.fetch(url, {
      ...mergedOptions,
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch (e) {
        errorBody = 'Unable to retrieve response body';
      }

      const errorResponse: ErrorResponse = {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      };

      throw new HttpError(
        `HTTP error! status: ${response.status}`,
        errorResponse
      );
    }

    return (await response.json()) as T;
  } catch (error: any) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error.name === 'AbortError') {
      throw new TimeoutError(
        `Request timed out after ${timeout}ms`,
        url,
        timeout,
        mergedOptions.method || 'POST'
      );
    }
    // console.error('Error in post request:', error);
    throw error;
  }
}
