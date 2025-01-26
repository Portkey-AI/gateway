import { HookEventType, PluginContext } from './types';

interface PostOptions extends RequestInit {
  headers?: Record<string, string>;
}

export interface ErrorResponse {
  status: number;
  statusText: string;
  body: string;
}

export class HttpError extends Error {
  response: ErrorResponse;

  constructor(message: string, response: ErrorResponse) {
    super(message);
    this.name = 'HttpError';
    this.response = response;
  }
}

class TimeoutError extends Error {
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

export const getText = (
  context: PluginContext,
  eventType: HookEventType
): string => {
  switch (eventType) {
    case 'beforeRequestHook':
      return context.request?.text;
    case 'afterRequestHook':
      return context.response?.text;
    default:
      throw new Error('Invalid hook type');
  }
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
  let textArray: Array<string> = [];
  let content: Array<any> | string | Record<string, any> | null = null;

  // Handle chat completion request/response format
  if (context.requestType === 'chatComplete') {
    if (target === 'request') {
      // Get the last message's content from the chat history
      content = json.messages[json.messages.length - 1].content;
      textArray = Array.isArray(content)
        ? content.map((item: any) => item.text || '')
        : [content];
    } else {
      // Get the content from the last choice in the response
      content = json.choices[json.choices.length - 1].message.content as string;
      textArray = [content];
    }
  } else if (context.requestType === 'complete') {
    if (target === 'request') {
      // Handle completions format
      content = json.prompt;
      textArray = Array.isArray(content)
        ? content.map((item: any) => item)
        : [content];
    } else {
      content = json.choices[json.choices.length - 1].text as string;
      textArray = [content];
    }
  }
  return { content, textArray };
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

  // Create shallow copy of the json
  const updatedJson = { ...json };

  // Handle updating text fields if provided
  if (textArray?.length) {
    if (requestType === 'chatComplete') {
      if (target === 'request') {
        const currentContent =
          updatedJson.messages[updatedJson.messages.length - 1].content;
        updatedJson.messages = [...json.messages];
        updatedJson.messages[updatedJson.messages.length - 1] = {
          ...updatedJson.messages[updatedJson.messages.length - 1],
        };

        if (Array.isArray(currentContent)) {
          updatedJson.messages[updatedJson.messages.length - 1].content =
            currentContent.map((item: any, index: number) => ({
              ...item,
              text: textArray[index] || item.text,
            }));
        } else {
          updatedJson.messages[updatedJson.messages.length - 1].content =
            textArray[0] || currentContent;
        }
        transformedData.request.json = updatedJson;
      } else {
        updatedJson.choices = [...json.choices];
        const lastChoice = {
          ...updatedJson.choices[updatedJson.choices.length - 1],
        };
        lastChoice.message = {
          ...lastChoice.message,
          content: textArray[0] || lastChoice.message.content,
        };
        updatedJson.choices[updatedJson.choices.length - 1] = lastChoice;
        transformedData.response.json = updatedJson;
      }
    } else {
      if (target === 'request') {
        updatedJson.prompt = Array.isArray(updatedJson.prompt)
          ? textArray.map((text, index) => text || updatedJson.prompt[index])
          : textArray[0];
        transformedData.request.json = updatedJson;
      } else {
        updatedJson.choices = [...json.choices];
        updatedJson.choices[json.choices.length - 1].text =
          textArray[0] || json.choices[json.choices.length - 1].text;
        transformedData.response.json = updatedJson;
      }
    }
  }
};

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

    const response: Response = await fetch(url, {
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
