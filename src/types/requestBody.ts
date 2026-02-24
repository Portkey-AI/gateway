import { BatchEndpoints } from '../globals';
import { HookObject } from '../middlewares/hooks/types';

/**
 * Settings for retrying requests.
 * @interface
 */
interface RetrySettings {
  /** The maximum number of retry attempts. */
  attempts: number;
  /** The HTTP status codes on which to retry. */
  onStatusCodes: number[];
  /** Whether to use the provider's retry wait. */
  useRetryAfterHeader?: boolean;
}

interface CacheSettings {
  mode: string;
  maxAge?: number;
}

export enum StrategyModes {
  LOADBALANCE = 'loadbalance',
  FALLBACK = 'fallback',
  SINGLE = 'single',
  CONDITIONAL = 'conditional',
}

/**
 * Configuration for sticky sessions in load balancing.
 * @interface
 */
export interface StickyConfig {
  /** Whether sticky sessions are enabled. */
  enabled: boolean;
  /** Metadata fields to include in the sticky session identifier (in addition to API key). */
  hash_fields?: string[];
  /** Time-to-live for sticky sessions in seconds. Defaults to 300 (5 minutes). */
  ttl?: number;
}

interface Strategy {
  mode: StrategyModes;
  onStatusCodes?: Array<number>;
  conditions?: {
    query: {
      [key: string]: any;
    };
    then: string;
  }[];
  default?: string;
  /** Configuration for sticky sessions (only applicable for loadbalance mode). */
  sticky?: StickyConfig;
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
  azureAuthMode?: string;
  azureManagedClientId?: string;
  azureEntraClientId?: string;
  azureEntraClientSecret?: string;
  azureEntraTenantId?: string;
  azureAdToken?: string;
  azureModelName?: string;
  azureWorkloadClientId?: string;
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
  /** This is used to determine if the request should be transformed to formData Example: Stability V2 */
  transformToFormData?: boolean;
  /** AWS specific (used for Bedrock and Sagemaker) */
  awsSecretAccessKey?: string;
  awsAccessKeyId?: string;
  awsSessionToken?: string;
  awsRegion?: string;
  awsAuthType?: string;
  awsRoleArn?: string;
  awsExternalId?: string;
  awsS3Bucket?: string;
  awsS3ObjectKey?: string;
  awsBedrockModel?: string;
  awsServerSideEncryption?: string;
  awsServerSideEncryptionKMSKeyId?: string;
  awsService?: string;

  /** Sagemaker specific */
  amznSagemakerCustomAttributes?: string;
  amznSagemakerTargetModel?: string;
  amznSagemakerTargetVariant?: string;
  amznSagemakerTargetContainerHostname?: string;
  amznSagemakerInferenceId?: string;
  amznSagemakerEnableExplanations?: string;
  amznSagemakerInferenceComponent?: string;
  amznSagemakerSessionId?: string;
  amznSagemakerModelName?: string;

  /** Stability AI specific */
  stabilityClientId?: string;
  stabilityClientUserId?: string;
  stabilityClientVersion?: string;

  /** Hugging Face specific */
  huggingfaceBaseUrl?: string;
  /** Google Vertex AI specific */
  vertexRegion?: string;
  vertexProjectId?: string;
  vertexServiceAccountJson?: Record<string, any>;
  vertexStorageBucketName?: string;
  vertexModelName?: string;
  vertexBatchEndpoint?: BatchEndpoints;
  vertexAuthType?: string;
  afterRequestHooks?: HookObject[];
  beforeRequestHooks?: HookObject[];
  defaultInputGuardrails?: HookObject[];
  defaultOutputGuardrails?: HookObject[];
  /** OpenAI specific */
  openaiProject?: string;
  openaiOrganization?: string;
  openaiBeta?: string;
  /** Azure Inference Specific */
  azureApiVersion?: string;
  azureFoundryUrl?: string;
  azureExtraParameters?: string;
  azureDeploymentName?: string;
  filename?: string;

  /** The parameter to determine if extra non-openai compliant fields should be returned in response */
  strictOpenAiCompliance?: boolean;

  /** Parameter to determine if fim/completions endpoint is to be used */
  mistralFimCompletion?: string;

  /** Anthropic specific headers */
  anthropicBeta?: string;
  anthropicVersion?: string;
  anthropicApiKey?: string;

  /** Fireworks finetune required fields */
  fireworksAccountId?: string;
  fireworksFileLength?: string;

  /** Cortex specific fields */
  snowflakeAccount?: string;

  // Scope to generate entra token
  azureEntraScope?: string;

  // Oracle specific fields
  oracleApiVersion?: string; // example: 20160918
  oracleRegion?: string; // example: us-ashburn-1
  oracleCompartmentId?: string; // example: ocid1.compartment.oc1..aaaaaaaab7x77777777777777777
  oracleServingMode?: string; // supported values: ON_DEMAND, DEDICATED
  oracleTenancy?: string; // example: ocid1.tenancy.oc1..aaaaaaaab7x77777777777777777
  oracleUser?: string; // example: ocid1.user.oc1..aaaaaaaab7x77777777777777777
  oracleFingerprint?: string; // example: 12:34:56:78:90:ab:cd:ef:12:34:56:78:90:ab:cd:ef
  oraclePrivateKey?: string; // example: -----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...
  oracleKeyPassphrase?: string; // example: password

  databricksWorkspace?: string;
}

/**
 * Configuration for an AI provider.
 * @interface
 */
export interface Targets {
  name?: string;
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
  azureAuthMode?: string;
  azureManagedClientId?: string;
  azureEntraClientId?: string;
  azureEntraClientSecret?: string;
  azureEntraTenantId?: string;
  azureModelName?: string;
  /** provider option index picked based on weight in loadbalance mode */
  index?: number;
  cache?: CacheSettings | string;
  targets?: Targets[];
  /** This is used to determine if the request should be transformed to formData Example: Stability V2 */
  transformToFormData?: boolean;
  defaultInputGuardrails?: HookObject[];
  defaultOutputGuardrails?: HookObject[];
  originalIndex?: number;
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
export interface ContentType extends PromptCache {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  image_url?: {
    url: string;
    detail?: string;
    mime_type?: string;
    media_resolution?: string;
  };
  data?: string;
  file?: {
    file_data?: string;
    file_id?: string;
    file_name?: string;
    file_url?: string;
    mime_type?: string;
  };
  input_audio?: {
    data: string;
    format: string; //defaults to auto
  };
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
    thought_signature?: string; // for gemini models like gemini 3.0 pro
  };
}

export enum MESSAGE_ROLES {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  FUNCTION = 'function',
  TOOL = 'tool',
  DEVELOPER = 'developer',
}

export const SYSTEM_MESSAGE_ROLES = ['system', 'developer'];

export type OpenAIMessageRole =
  | 'system'
  | 'user'
  | 'assistant'
  | 'function'
  | 'tool'
  | 'developer';

export interface ContentBlockChunk extends Omit<ContentType, 'type'> {
  index: number;
  type?: string;
}

/**
 * A message in the conversation.
 * @interface
 */
export interface Message {
  /** The role of the message sender. It can be 'system', 'user', 'assistant', or 'function'. */
  role: OpenAIMessageRole;
  /** The content of the message. */
  content?: string | ContentType[];
  content_blocks?: ContentType[];
  /** The name of the function to call, if any. */
  name?: string;
  /** The function call to make, if any. */
  function_call?: any;
  tool_calls?: any;
  tool_call_id?: string;
  citationMetadata?: CitationMetadata;
}

export interface PromptCache {
  cache_control?: { type: 'ephemeral' };
}

export interface CitationMetadata {
  citationSources?: CitationSource[];
}

export interface CitationSource {
  startIndex?: number;
  endIndex?: number;
  uri?: string;
  license?: string;
}

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
  /** Whether to enable strict schema adherence when generating the function call. If set to true, the model will follow the exact schema defined in the parameters field. Only a subset of JSON Schema is supported when strict is true */
  strict?: boolean;
  [key: string]: any;
}

export interface ToolChoiceObject {
  type: string;
  function: {
    name: string;
  };
}

export interface CustomToolChoice {
  type: 'custom';
  custom: {
    name?: string;
  };
}

export type ToolChoice =
  | ToolChoiceObject
  | CustomToolChoice
  | 'none'
  | 'auto'
  | 'required';

/**
 * A tool in the conversation.
 *
 * `cache_control` is extended to support for prompt-cache
 *
 * @interface
 */
export interface Tool extends PromptCache {
  /** The name of the function. */
  type: string;
  /** A description of the function. */
  function: Function;
  // this is used to support tools like computer, web_search, etc.
  [key: string]: any;
}

/**
 * The parameters for the request.
 * @interface
 */
export interface Params {
  model?: string;
  prompt?: string | string[];
  messages?: Message[];
  functions?: Function[];
  function_call?: 'none' | 'auto' | { name: string };
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  logprobs?: number;
  top_logprobs?: boolean;
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
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | string;
  response_format?: {
    type: 'json_object' | 'text' | 'json_schema';
    json_schema?: any;
  };
  seed?: number;
  store?: boolean;
  metadata?: Record<string, string>;
  modalities?: string[];
  audio?: {
    voice: string;
    format: 'mp3' | 'wav' | string;
  };
  service_tier?: string;
  prediction?: {
    type: string;
    content:
      | {
          type: string;
          text: string;
        }[]
      | string;
  };
  // Google Vertex AI specific
  safety_settings?: any;
  // Embeddings specific
  dimensions?: number;
  parameters?: any;
  thinking?: {
    type?: string;
    budget_tokens?: number;
  };
  [key: string]: any;
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
  azureAuthMode?: string;
  azureManagedClientId?: string;
  azureEntraClientId?: string;
  azureEntraClientSecret?: string;
  azureEntraTenantId?: string;
  azureModelName?: string;
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
