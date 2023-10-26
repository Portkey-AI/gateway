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
    /** provider option index picked based on weight in loadbalance mode */
    index?: number;
    /** This local base url is used for ollama. */
    localBaseUrl?: string;
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
}

/**
 * A message in the conversation.
 * @interface
 */
export interface Message {
    /** The role of the message sender. It can be 'system', 'user', 'assistant', or 'function'. */
    role: 'system' | 'user' | 'assistant' | 'function';
    /** The content of the message. */
    content?: string;
    /** The name of the function to call, if any. */
    name?: string;
    /** The function call to make, if any. */
    function_call?: any;
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
}

/**
 * The parameters for the request.
 * @interface
 */
export interface Params {
    model: string;
    prompt?: string | string[];
    messages?: Message[];
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
    /** The local base url of ollama. */
    localBaseUrl?: string;
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

