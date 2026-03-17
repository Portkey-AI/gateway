import { HookEventType, PluginContext } from './types';

interface PostOptions extends RequestInit {
  headers?: Record<string, string>;
  [key: string]: any;
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
  }
  return { content, textArray };
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
  }
  transformedData.request.json = updatedJson;
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
  }
  transformedData.response.json = updatedJson;
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
