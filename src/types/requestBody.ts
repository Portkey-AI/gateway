/**
 * Settings for retrying requests.
 * @interface
 */
interface RetrySettings {
  /** The maximum number of retry attempts. */
  attempts: number;
  /** The HTTP status codes on which to retry. */
  onStatusCodes: number[];
}

interface CacheSettings {
  mode: string;
  maxAge?: number;
}

interface Strategy {
  mode: string;
  onStatusCodes?: Array<number>;
}

/**
 * Configuration for an AI provider.
 * @interface
 */
export interface Options {
  /** The name of the provider. */
  provider: string | undefined;
  /** The name of the API key for the provider. */
  virtualKey?: string;
  /** The API key for the provider. */
  apiKey?: string;
  /** The weight of the provider, used for load balancing. */
  weight?: number;
  /** The retry settings for the provider. */
  retry?: RetrySettings;
  /** The parameters to override in the request. */
  overrideParams?: Params;
  /** The actual url used to make llm calls */
  urlToFetch?: string;
  /** Azure specific */
  resourceName?: string;
  deploymentId?: string;
  apiVersion?: string;
  adAuth?: string;
  /** Workers AI specific */
  workersAiAccountId?: string;
  /** The parameter to set custom base url */
  customHost?: string;
  /** The parameter to set list of headers to be forwarded as-is to the provider */
  forwardHeaders?: string[];
  /** provider option index picked based on weight in loadbalance mode */
  index?: number;
  cache?: CacheSettings | string;
  metadata?: Record<string, string>;
  requestTimeout?: number;
  /** AWS Bedrock specific */
  awsSecretAccessKey?: string;
  awsAccessKeyId?: string;
  awsSessionToken?: string;
  awsRegion?: string;

  /** Google Vertex AI specific */
  vertexRegion?: string;
  vertexProjectId?: string;
  vertexServiceAccountJson?: Record<string, any>;

  /** OpenAI specific */
  openaiProject?: string;
  openaiOrganization?: string;
}

/**
 * Configuration for an AI provider.
 * @interface
 */
export interface Targets {
  strategy?: Strategy;
  /** The name of the provider. */
  provider?: string | undefined;
  /** The name of the API key for the provider. */
  virtualKey?: string;
  /** The API key for the provider. */
  apiKey?: string;
  /** The weight of the provider, used for load balancing. */
  weight?: number;
  /** The retry settings for the provider. */
  retry?: RetrySettings;
  /** The parameters to override in the request. */
  overrideParams?: Params;
  /** The actual url used to make llm calls */
  urlToFetch?: string;
  /** Azure specific */
  resourceName?: string;
  deploymentId?: string;
  apiVersion?: string;
  adAuth?: string;
  /** provider option index picked based on weight in loadbalance mode */
  index?: number;
  cache?: CacheSettings | string;
  targets?: Targets[];
}

/**
 * Configuration for handling the request.
 * @interface
 */
export interface Config {
  /** The mode for handling the request. It can be "single", "fallback", "loadbalance", or "scientist". */
  mode: 'single' | 'fallback' | 'loadbalance' | 'scientist';
  /** The configuration for the provider(s). */
  options: Options[];
  targets?: Targets[];
  cache?: CacheSettings;
  retry?: RetrySettings;
  strategy?: Strategy;
  customHost?: string;
}

/**
 * A message content type.
 * @interface
 */
export interface ContentType {
  type: string;
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ToolCall {
  id: string;
  type: string;
  index?: number;
  function: {
    name: string;
    arguments: string;
  };
}

export type OpenAIMessageRole =
  | 'system'
  | 'user'
  | 'assistant'
  | 'function'
  | 'tool';

export interface TextMessageContentItem {
  type: 'text';
  text: string;
}

export interface ImageMessageContentItem {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: string;
  };
}

type SystemMessageContent = string | TextMessageContentItem[];

type UserMessageContent =
  | string
  | (TextMessageContentItem | ImageMessageContentItem)[];

export type AssistantMessageContent = string | TextMessageContentItem[];

type ToolMessageContent = string | TextMessageContentItem[];

export interface SystemMessage {
  content: SystemMessageContent;
  role: 'system';
  name?: string;
}

/**
 * A User message in the conversation.
 * @interface
 */
export interface UserMessage {
  content: UserMessageContent;
  role: 'user';
  name?: string;
}

/**
 * An Assistant message in teh conversation.
 * @interface
 */
export interface AssistantMessage {
  content?: AssistantMessageContent;
  role: 'assistant';
  name?: string;
  tool_calls?: ToolCall[];
}

/**
 * A Tool message.
 * @interface
 */
export interface ToolMessage {
  content: ToolMessageContent;
  role: 'tool';
  tool_call_id: string;
}

/**
 * A message in the conversation.
 * @type
 */
export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;

/**
 * A JSON schema.
 * @interface
 */
export interface JsonSchema {
  /** The schema definition, indexed by key. */
  [key: string]: any;
}

/**
 * A function in the conversation.
 * @interface
 */
export interface Function {
  /** The name of the function. */
  name: string;
  /** A description of the function. */
  description?: string;
  /** The parameters for the function. */
  parameters?: JsonSchema;
}

export interface ToolChoiceObject {
  type: string;
  function: {
    name: string;
  };
}

export type ToolChoice = ToolChoiceObject | 'none' | 'auto' | 'required';

/**
 * A tool in the conversation.
 * @interface
 */
export interface Tool {
  /** The name of the function. */
  type: string;
  /** A description of the function. */
  function?: Function;
}

/**
 * The parameters for the request.
 * @interface
 */
export interface Params {
  model: string;
  prompt?: string | string[];
  messages: Message[];
  functions?: Function[];
  function_call?: 'none' | 'auto' | { name: string };
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  logprobs?: number;
  echo?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  best_of?: number;
  logit_bias?: { [key: string]: number };
  user?: string;
  context?: string;
  examples?: Examples[];
  top_k?: number;
  tools?: Tool[];
  tool_choice?: ToolChoice;
  response_format?: { type: 'json_object' | 'text' };
  // Google Vertex AI specific
  safety_settings?: any;
}

interface Examples {
  input?: Message;
  output?: Message;
}

/**
 * The full structure of the request body.
 * @interface
 */
interface FullRequestBody {
  /** The configuration for handling the request. */
  config: Config;
  /** The parameters for the request. */
  params: Params;
}

/**
 * A shortened structure of the request body, with a simpler configuration.
 * @interface
 */
export interface ShortConfig {
  /** The name of the provider. */
  provider: string;
  /** The name of the API key for the provider. */
  virtualKey?: string;
  /** The API key for the provider. */
  apiKey?: string;
  cache?: CacheSettings;
  retry?: RetrySettings;
  resourceName?: string;
  deploymentId?: string;
  workersAiAccountId?: string;
  apiVersion?: string;
  customHost?: string;
  // Google Vertex AI specific
  vertexRegion?: string;
  vertexProjectId?: string;
}

/**
 * The shortened structure of the request body.
 * @interface
 */
interface ShortRequestBody {
  /** The simplified configuration for handling the request. */
  config: ShortConfig;
  /** The parameters for the request. */
  params: Params;
}

/**
 * The request body, which can be either a `FullRequestBody` or a `ShortRequestBody`.
 * @type
 */
export type RequestBody = FullRequestBody | ShortRequestBody;
