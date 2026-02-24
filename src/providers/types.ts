import { Context } from 'hono';
import { Message, Options, Params } from '../types/requestBody';
import { ANTHROPIC_STOP_REASON } from './anthropic/types';
import {
  BEDROCK_CONVERSE_STOP_REASON,
  TITAN_STOP_REASON,
} from './bedrock/types';
import { DEEPSEEK_STOP_REASON } from './deepseek/types';
import { VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON } from './google-vertex-ai/types';
import { GOOGLE_GENERATE_CONTENT_FINISH_REASON } from './google/types';
import { MISTRAL_AI_FINISH_REASON } from './mistral-ai/types';
import { TOGETHER_AI_FINISH_REASON } from './together-ai/types';
import { COHERE_STOP_REASON } from './cohere/types';

/**
 * Configuration for a parameter.
 * @interface
 */
export interface ParameterConfig {
  /** corresponding provider parameter key in the transformed request body */
  param: string;
  /** The default value of the parameter, if not provided in the request. */
  default?: unknown | ((config: any, options?: Options) => any);
  /** The minimum value of the parameter. */
  min?: number;
  /** The maximum value of the parameter. */
  max?: number;
  /** Whether the parameter is required. */
  required?: boolean;
  /** A function to transform the value of the parameter. */
  transform?: (params: any, providerOptions: Options) => any;
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
  /** A function to generate the headers for the API request. */
  headers: (args: {
    c: Context;
    providerOptions: Options;
    fn: string;
    transformedRequestBody: Record<string, any>;
    transformedRequestUrl: string;
    gatewayRequestBody?: Params | ArrayBuffer;
    headers?: Record<string, string>;
  }) => Promise<Record<string, any>> | Record<string, any>;
  /** A function to generate the baseURL based on parameters */
  getBaseURL: (args: {
    providerOptions: Options;
    fn?: endpointStrings;
    requestHeaders?: Record<string, string>;
    c: Context;
    gatewayRequestURL: string;
    params?: Params;
  }) => Promise<string> | string;
  /** A function to generate the endpoint based on parameters */
  getEndpoint: (args: {
    c: Context;
    providerOptions: Options;
    fn: endpointStrings;
    gatewayRequestBodyJSON: Params;
    gatewayRequestBody?: FormData | Params | ArrayBuffer | ReadableStream;
    gatewayRequestURL: string;
  }) => string;
  /** A function to determine if the request body should be transformed to form data */
  transformToFormData?: (args: { gatewayRequestBody: Params }) => boolean;
  getProxyEndpoint?: (args: {
    providerOptions: Options;
    reqPath: string;
    reqQuery: string;
    requestHeaders: Record<string, string>;
  }) => string;
  getOptions?: () => RequestInit;
}

export type endpointStrings =
  | 'complete'
  | 'chatComplete'
  | 'embed'
  | 'rerank'
  | 'moderate'
  | 'stream-complete'
  | 'stream-chatComplete'
  | 'stream-messages'
  | 'proxy'
  | 'imageGenerate'
  | 'imageEdit'
  | 'createSpeech'
  | 'createTranscription'
  | 'createTranslation'
  | 'realtime'
  | 'uploadFile'
  | 'listFiles'
  | 'retrieveFile'
  | 'deleteFile'
  | 'retrieveFileContent'
  | 'createBatch'
  | 'retrieveBatch'
  | 'cancelBatch'
  | 'listBatches'
  | 'getBatchOutput'
  | 'listFinetunes'
  | 'createFinetune'
  | 'retrieveFinetune'
  | 'cancelFinetune'
  | 'createModelResponse'
  | 'getModelResponse'
  | 'deleteModelResponse'
  | 'listResponseInputItems'
  | 'messages'
  | 'messagesCountTokens'
  | 'realtime';

/**
 * A collection of API configurations for multiple AI providers.
 * @interface
 */
export interface ProviderAPIConfigs {
  /** The API configuration for each provider, indexed by provider name. */
  [key: string]: ProviderAPIConfig;
}

export type RequestHandler<
  T = Params | FormData | ArrayBuffer | ReadableStream,
> = (Params: {
  c: Context;
  providerOptions: Options;
  requestURL: string;
  requestHeaders: Record<string, string>;
  requestBody: T;
}) => Promise<Response>;

export type RequestHandlers = Partial<
  Record<endpointStrings, RequestHandler<any>>
>;

export type RequestTransforms = Partial<
  Record<
    endpointStrings,
    (requestBody: any, requestHeaders: Record<string, string>) => any
  >
>;

/**
 * A collection of configurations for multiple AI providers.
 * @interface
 */
export interface ProviderConfigs {
  /** The configuration for each provider, indexed by provider name. */
  [key: string]: any;
  requestHandlers?: RequestHandlers;
  requestTransforms?: RequestTransforms;
  getConfig?: ({
    params,
    fn,
    providerOptions,
  }: {
    params: Params;
    fn?: endpointStrings;
    providerOptions?: Options;
  }) => ProviderConfigs;
  pricing?: LogConfig;
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
    completion_tokens_details?: {
      accepted_prediction_tokens?: number;
      audio_tokens?: number;
      reasoning_tokens?: number;
      rejected_prediction_tokens?: number;
    };
    prompt_tokens_details?: {
      audio_tokens?: number;
      cached_tokens?: number;
    };
    num_search_queries?: number;
    /*
     * Anthropic Prompt cache token usage
     */
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
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
  logprobs?: object | null;
  groundingMetadata?: GroundingMetadata;
}

export interface Logprobs {
  token: string;
  logprob: number;
  bytes: number[];
  top_logprobs?: {
    token: string;
    logprob: number;
    bytes: number[];
  }[];
}

export interface GroundingMetadata {
  webSearchQueries?: string[];
  searchEntryPoint?: {
    renderedContent: string;
  };
  groundingSupports?: Array<{
    segment: {
      startIndex: number;
      endIndex: number;
      text: string;
    };
    groundingChunkIndices: number[];
    confidenceScores: number[];
  }>;
  retrievalMetadata?: {
    webDynamicRetrievalScore: number;
  };
}

/**
 * The structure of a completion response for the 'chatComplete' function.
 * @interface
 */
export interface ChatCompletionResponse extends CResponse {
  choices: ChatChoice[];
  provider?: string;
  citations?: string[];
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
  };
  provider: string;
}

/**
 * The structure of a image generation response
 * @interface
 */
export interface ImageGenerateResponse {
  created: number;
  data: object[];
  provider: string;
}

/**
 * The response body for uploading a file.
 * @interface
 */
export interface UploadFileResponse extends File {}

/**
 * The response body for getting a file.
 * @interface
 */
export interface GetFileResponse extends File {}

/**
 * The response body for getting a list of files.
 * @interface
 */
export interface GetFilesResponse {
  data: File[];
  object: 'list';
}

/**
 * File object
 * @interface
 */
export interface File {
  id: string;
  object: string;
  bytes?: number;
  created_at: number;
  filename: string;
  purpose:
    | string
    | 'assistants'
    | 'assistants_output'
    | 'batch'
    | 'batch_output'
    | 'fine-tune'
    | 'fine-tune-results'
    | 'vision';
  status?: string | 'uploaded' | 'processed' | 'error';
  status_details?: string;
}

/**
 * The response body for deleting a file.
 * @interface
 */
export interface DeleteFileResponse {
  object: string;
  deleted: boolean;
  id: string;
}

interface Batch {
  id: string;
  object: string;
  endpoint?: string | 'batch';
  errors?: {
    object: string | 'list';
    data: {
      code: string;
      message: string;
      param?: string;
      line?: number;
    }[];
  };
  input_file_id?: string;
  completion_window?: string;
  status?: string;
  output_file_id?: string;
  error_file_id?: string;
  created_at?: number;
  in_progress_at?: number;
  expires_at?: number;
  finalizing_at?: number;
  completed_at?: number;
  failed_at?: number;
  expired_at?: number;
  cancelling_at?: number;
  cancelled_at?: number;
  request_counts?: {
    total: number;
    completed: number;
    failed: number;
  };
  metadata?: Record<string, any>;
  output_blob?: string;
  error_blob?: string;
}

export interface CreateBatchResponse extends Batch {}
export interface RetrieveBatchResponse extends Batch {}
export interface CancelBatchResponse extends Batch {}
export interface ListBatchesResponse {
  object: string | 'list';
  data: Batch[];
}

interface FinetuneProviderOptions {
  model: string;
  training_type: 'chat' | 'text';
  [key: string]: any;
}

export interface FinetuneRequest {
  model: string;
  suffix: string;
  provider_options?: FinetuneProviderOptions;
  training_file: string;
  validation_file?: string;
  model_type?: string;
  hyperparameters?: {
    n_epochs?: number;
    learning_rate_multiplier?: number;
    batch_size?: number;
  };
  method?: {
    type: 'supervised' | 'dpo';
    supervised?: {
      hyperparameters: {
        n_epochs?: number;
        learning_rate_multiplier?: number;
        batch_size?: number;
      };
    };
    dpo?: {
      hyperparameters: {
        beta?: string | number;
        n_epochs?: number;
        learning_rate_multiplier?: number;
        batch_size?: number;
      };
    };
  };
}

export interface CreateBatchRequest {
  input_file_id: string;
  endpoint: string;
  completion_window: string;
}

export interface StreamContentBlock {
  index: number;
  delta: {
    text?: string;
    thinking?: string;
    signature?: string;
    data?: string;
  };
}

export enum FINISH_REASON {
  stop = 'stop',
  length = 'length',
  tool_calls = 'tool_calls',
  content_filter = 'content_filter',
  function_call = 'function_call',
  refusal = 'refusal',
}

export type PROVIDER_FINISH_REASON =
  | ANTHROPIC_STOP_REASON
  | BEDROCK_CONVERSE_STOP_REASON
  | VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON
  | GOOGLE_GENERATE_CONTENT_FINISH_REASON
  | TITAN_STOP_REASON
  | DEEPSEEK_STOP_REASON
  | MISTRAL_AI_FINISH_REASON
  | TOGETHER_AI_FINISH_REASON
  | COHERE_STOP_REASON;

export type VIDEO_DURATION_UNIT_KEY =
  | 'video_duration_seconds'
  | `video_duration_seconds_${number}_${number}`;

export type PRICING_ADDITIONAL_UNIT_KEY =
  | 'web_search'
  | 'web_search_low_context'
  | 'web_search_medium_context'
  | 'web_search_high_context'
  | 'file_search'
  | 'input_image'
  | 'input_video_plus'
  | 'input_video_standard'
  | 'input_video_essential'
  | 'request_audio_token'
  | 'routing_units'
  | 'response_audio_token'
  | 'video_seconds'
  | 'video_audio_seconds'
  | VIDEO_DURATION_UNIT_KEY
  | 'megapixels'
  | 'default_steps'
  | 'finetune_training_hours'
  | 'finetune_token_units';

export type PRICING_ADDITIONAL_UNIT_CONTEXT_LENGTH_KEY =
  | 'low_context'
  | 'medium_context'
  | 'high_context';

export type Tokens = {
  reqUnits: number;
  resUnits: number;
  cacheWriteInputUnits?: number;
  cacheReadInputUnits?: number;
  cacheReadAudioInputUnits?: number;
  resAudioUnits?: number;
  resTextUnits?: number;
  reqTextUnits?: number;
  reqAudioUnits?: number;
  reqImageUnits?: number;
  resImageUnits?: number;
  cachedImageUnits?: number;
  cachedTextUnits?: number;
  additionalUnits?: {
    [key in PRICING_ADDITIONAL_UNIT_KEY]?: number;
  };
};

export type ModelPricingConfig = {
  [model: string]: {
    pricing_config: PricingConfig | null;
  };
};

export interface GenerationCost {
  requestCost: number;
  responseCost: number;
  currency: string;
}

interface PayAsYouGo {
  type?: 'static' | 'dynamic';
  request_token?: { price: number };
  response_token?: { price: number };
  cache_write_input_token?: { price: number };
  cache_read_input_token?: { price: number };
  cache_read_audio_input_token?: { price: number };
  request_audio_token?: { price: number };
  response_audio_token?: { price: number };
  reasoning_token?: { price: number };
  prediction_accepted_token?: { price: number };
  prediction_rejected_token?: { price: number };
  request_image_token?: { price: number };
  response_image_token?: { price: number };
  request_text_token?: { price: number };
  response_text_token?: { price: number };
  cached_image_input_token?: { price: number };
  cached_text_input_token?: { price: number };
  image?: any;
  additional_units?: {
    [key in PRICING_ADDITIONAL_UNIT_KEY]?: { price: number };
  };
}

export interface BatchConfig {
  request_token?: { price: number };
  response_token?: { price: number };
  cache_write_input_token?: { price: number };
  cache_read_input_token?: { price: number };
  cache_read_audio_input_token?: { price: number };
  request_audio_token?: { price: number };
  response_audio_token?: { price: number };
  request_image_token?: { price: number };
  response_image_token?: { price: number };
  request_text_token?: { price: number };
  response_text_token?: { price: number };
  cached_image_input_token?: { price: number };
  cached_text_input_token?: { price: number };
  image?: any;
}

export interface FinetuneConfig {
  pay_per_token?: { price: number };
  pay_per_hour?: { price: number };
}

export interface PricingConfig {
  finetune_config?: FinetuneConfig;
  batch_config?: BatchConfig;
  pay_as_you_go: PayAsYouGo;
  fixed_cost?: {
    request?: { price: number };
    response?: { price: number };
  };
  calculate?: {
    request?: any;
    response?: any;
  };
  currency: string;
  type?: 'static' | 'dynamic';
}
export interface Operation {
  operation: 'sum' | 'multiply' | 'divide' | 'subtract';
  operands: (Operation | { value: string })[];
}

export type ModelInput = {
  env: Record<string, any>;
  url: string;
  apiKey: string;
  reqBody: Record<string, any>;
  resBody: Record<string, any>;
  providerOptions: Record<string, any>;
  isProxyCall: boolean;
  originalReqBody?: Record<string, any>;
  headers?: Record<string, string>;
};

export type TokenInput = {
  env: Record<string, any>;
  url: string;
  reqBody: Record<string, any>;
  resBody: Record<string, any>;
  model: string;
  originalResBody?: Record<string, any>;
  originalReqBody?: Record<string, any>;
  portkeyHeaders: Record<string, any>;
  requestMethod?: string;
};

export type PriceInput = {
  model: string;
  url: string;
  reqUnits: number;
  resUnits: number;
  requestBody?: Record<string, any>;
};
export interface LogConfig {
  /** The configuration for each provider, indexed by provider name. */
  getBaseURL: () => string;
  modelConfig: (input: ModelInput) => string | Promise<string>;
  tokenConfig: (input: TokenInput) => Tokens | Promise<Tokens>;
  priceConfig?: (
    input: PriceInput
  ) => PricingConfig | null | Promise<PricingConfig | null>;
}
