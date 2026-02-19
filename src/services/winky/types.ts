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
  image?: any;
  additional_units?: {
    [key in PRICING_ADDITIONAL_UNIT_KEY]?: { price: number };
  };
}

export interface FinetuneConfig {
  pay_per_token?: { price: number };
  pay_per_hour?: { price: number };
}

export interface BatchConfig {
  request_token?: { price: number };
  response_token?: { price: number };
  cache_write_input_token?: { price: number };
  cache_read_input_token?: { price: number };
  cache_read_audio_input_token?: { price: number };
  request_audio_token?: { price: number };
  response_audio_token?: { price: number };
  image?: any;
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

export enum AiProviders {
  DEFAULT = 'default',
  OPEN_AI = 'openai',
  COHERE = 'cohere',
  DEEPSEEK = 'deepseek',
  AZURE_OPEN_AI = 'azure-openai',
  ANTHROPIC = 'anthropic',
  ANYSCALE = 'anyscale',
  PALM = 'palm',
  TOGETHER_AI = 'together-ai',
  GOOGLE = 'google',
  PERPLEXITY_AI = 'perplexity-ai',
  MISTRAL_AI = 'mistral-ai',
  //  DEEPINFRA= 'deepinfra',
  STABILITY_AI = 'stability-ai',
  NOMIC = 'nomic',
  //  OLLAMA= 'ollama',
  AI21 = 'ai21',
  BEDROCK = 'bedrock',
  GROQ = 'groq',
  SEGMIND = 'segmind',
  JINA = 'jina',
  FIREWORKS_AI = 'fireworks-ai',
  VERTEX_AI = 'vertex-ai',
  NOVITA_AI = 'novita-ai',
  OPENROUTER = 'openrouter',
  REKA = 'reka-ai',
  MONSTER_API = 'monsterapi',
  PREDIBASE = 'predibase',
  DEEPBRICKS = 'deepbricks',
  CEREBRAS = 'cerebras',
  WORKERS_AI = 'workers-ai',
  SAGEMAKER = 'sagemaker',
  AZURE_AI = 'azure-ai',
  DASHSCOPE = 'dashscope',
  ORACLE = 'oracle',
}
