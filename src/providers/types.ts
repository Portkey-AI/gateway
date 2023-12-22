import { Message } from "../types/requestBody";

/**
 * Configuration for a parameter.
 * @interface
 */
export interface ParameterConfig {
  /** The name of the parameter. */
  param: string;
  /** The default value of the parameter, if not provided in the request. */
  default?: any;
  /** The minimum value of the parameter. */
  min?: number;
  /** The maximum value of the parameter. */
  max?: number;
  /** Whether the parameter is required. */
  required?: boolean;
  /** A function to transform the value of the parameter. */
  transform?: Function;
}

/**
 * Configuration for an AI provider.
 * @interface
 */
export interface ProviderConfig {
  /** The configuration for each parameter, indexed by parameter name. */
  [key: string]: ParameterConfig | ParameterConfig[];
}

/**
 * Configuration for an AI provider's API.
 * @interface
 */
export interface ProviderAPIConfig {
  /** The base URL of the API. */
  baseURL?: string;
  /** The endpoint for the 'complete' function. */
  complete?: string;
  /** The endpoint for the 'stream-complete' function. */
  'stream-complete'?: string;
  /** The endpoint for the 'chatComplete' function. */
  chatComplete?: string;
  /** The endpoint for the 'stream-chatComplete' function. */
  'stream-chatComplete'?: string;
  /** The endpoint for the 'embed' function. */
  embed?: string;
  /** The endpoint for the 'rerank' function. */
  rerank?: string;
  /** The endpoint for the 'moderate' function. */
  moderate?: string;
  /** A function to generate the headers for the API request. */
  headers: Function;
  /** A function to generate the baseURL based on parameters */
  getBaseURL?: Function;
  /** A function to generate the endpoint based on parameters */
  getEndpoint?: Function;
  /** The endpoint for the 'stream-chatComplete' function. */
  proxy?: string;
}

export type endpointStrings = 'complete' | 'chatComplete' | 'embed' | 'rerank' | 'moderate' | 'stream-complete' | 'stream-chatComplete' | 'proxy'

/**
 * A collection of API configurations for multiple AI providers.
 * @interface
 */
export interface ProviderAPIConfigs {
  /** The API configuration for each provider, indexed by provider name. */
  [key: string]: ProviderAPIConfig;
}

/**
 * A collection of configurations for multiple AI providers.
 * @interface
 */
export interface ProviderConfigs {
  /** The configuration for each provider, indexed by provider name. */
  [key: string]: any;
}

export interface BaseResponse {
  object: string;
  model: string;
}

/**
 * The basic structure of a completion response.
 * @interface
 */
export interface CResponse extends BaseResponse {
  id: string;
  created: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * The structure of a completion response for the 'complete' function.
 * @interface
 */
export interface CompletionResponse extends CResponse {
  choices: {
    text: string;
    index: number;
    logprobs: null;
    finish_reason: string;
  }[];
}

/**
 * The structure of a choice in a chat completion response.
 * @interface
 */
export interface ChatChoice {
  index: number;
  message: Message;
  finish_reason: string;
}

/**
 * The structure of a completion response for the 'chatComplete' function.
 * @interface
 */
export interface ChatCompletionResponse extends CResponse {
  choices: ChatChoice[];
}

/**
 * The structure of a error response for all functions
 * @interface
 */
export interface ErrorResponse {
    error: {
        message: string;
        type: string | null;
        param: string | null;
        code: string | null;
    },
    provider: string
}

