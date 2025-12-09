import { MessageCreateParamsBase } from '../../types/MessagesRequest';

interface BedrockBatch {
  clientRequestToken: string;
  endTime: string;
  inputDataConfig: {
    s3InputDataConfig: {
      s3Uri: string;
      s3BucketOwner: string;
      s3InputFormat: string;
    };
  };
  jobArn: string;
  jobExpirationTime: string;
  jobName: string;
  lastModifiedTime: string;
  message: string;
  modelId: string;
  outputDataConfig: {
    s3OutputDataConfig: {
      s3Uri: string;
      s3BucketOwner: string;
      s3EncryptionKeyId: string;
    };
  };
  roleArn: string;
  status: string;
  submitTime: string;
  timeoutDurationInHours: number;
  vpcConfig: {
    securityGroupIds: string[];
    subnetIds: string[];
  };
}

export interface BedrockGetBatchResponse extends BedrockBatch {}

export interface BedrockListBatchesResponse {
  invocationJobSummaries: BedrockBatch[];
  nextToken: string;
}

export interface BedrockFinetuneRecord {
  baseModelArn: string;
  creationTime: string;
  customModelArn: string;
  customModelName: string;
  customizationType: string;
  endTime: string;
  jobArn: string;
  jobName: string;
  lastModifiedTime: string;
  status: 'Completed' | 'Failed' | 'InProgress' | 'Stopping' | 'Stopped';
  failureMessage?: string;
  validationDataConfig?: {
    s3Uri: string;
  };
  trainingDataConfig?: {
    s3Uri: string;
  };
  hyperParameters?: {
    learningRate: number;
    batchSize: number;
    epochCount: number;
  };
  outputModelName?: string;
  outputModelArn?: string;
}

export interface BedrockInferenceProfile {
  inferenceProfileName: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  inferenceProfileArn: string;
  models: {
    modelArn: string;
  }[];
  inferenceProfileId: string;
  status: string;
  type: string;
}

// https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html#API_runtime_Converse_ResponseSyntax
export enum BEDROCK_STOP_REASON {
  end_turn = 'end_turn',
  tool_use = 'tool_use',
  max_tokens = 'max_tokens',
  stop_sequence = 'stop_sequence',
  guardrail_intervened = 'guardrail_intervened',
  content_filtered = 'content_filtered',
}

export interface BedrockMessagesParams extends MessageCreateParamsBase {
  additionalModelRequestFields?: Record<string, any>;
  additional_model_request_fields?: Record<string, any>;
  additionalModelResponseFieldPaths?: string[];
  guardrailConfig?: {
    guardrailIdentifier: string;
    guardrailVersion: string;
    trace?: string;
  };
  guardrail_config?: {
    guardrailIdentifier: string;
    guardrailVersion: string;
    trace?: string;
  };
  anthropic_version?: string;
  countPenalty?: number;
}

/**
 * Tool parameter interface for Bedrock Messages API.
 * Includes advanced tool use properties supported via Invoke API
 * with appropriate beta headers (e.g., tool-search-tool-2025-10-19).
 */
export interface BedrockMessagesToolParam {
  name: string;
  description?: string;
  input_schema?: Record<string, any>;
  type?: string;
  cache_control?: { type: string };
  /**
   * When true, this tool is not loaded into context initially.
   * Requires beta header: tool-search-tool-2025-10-19 (Bedrock Invoke API only)
   */
  defer_loading?: boolean;
  /**
   * List of tool types that can call this tool programmatically.
   * Requires appropriate beta header.
   */
  allowed_callers?: string[];
  /**
   * Example inputs demonstrating how to use this tool.
   * Requires beta header: tool-examples-2025-10-29 (Bedrock Invoke API only)
   */
  input_examples?: Record<string, any>[];
}
export interface BedrockChatCompletionResponse {
  metrics: {
    latencyMs: number;
  };
  output: {
    message: {
      role: string;
      content: BedrockContentItem[];
    };
  };
  stopReason: BEDROCK_CONVERSE_STOP_REASON;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadInputTokenCount?: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokenCount?: number;
    cacheWriteInputTokens?: number;
  };
}

export type BedrockContentItem = {
  text?: string;
  toolUse?: {
    toolUseId: string;
    name: string;
    input: object;
  };
  reasoningContent?: {
    reasoningText?: {
      signature: string;
      text: string;
    };
    redactedContent?: string;
  };
  image?: {
    source: {
      bytes?: string;
      s3Location?: {
        uri: string;
        bucketOwner?: string;
      };
    };
    format: string;
  };
  document?: {
    format: string;
    name: string;
    source: {
      bytes?: string;
      s3Location?: {
        uri: string;
        bucketOwner?: string;
      };
    };
  };
  video?: {
    format: string;
    source: {
      bytes?: string;
      s3Location?: {
        uri: string;
        bucketOwner?: string;
      };
    };
  };
  cachePoint?: {
    type: string;
  };
};

export interface BedrockStreamState {
  stopReason?: BEDROCK_CONVERSE_STOP_REASON;
  currentToolCallIndex?: number;
  currentContentBlockIndex?: number;
}

export interface BedrockContentBlockDelta {
  text: string;
  toolUse: {
    toolUseId: string;
    name: string;
    input: string;
  };
  reasoningContent?: {
    text?: string;
    signature?: string;
    redactedContent?: string;
  };
}

export interface BedrockChatCompleteStreamChunk {
  role?: string;
  contentBlockIndex?: number;
  delta?: BedrockContentBlockDelta;
  start?: {
    toolUse: {
      toolUseId: string;
      name: string;
      input?: object;
    };
  };
  stopReason?: BEDROCK_CONVERSE_STOP_REASON;
  metrics?: {
    latencyMs: number;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadInputTokenCount?: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokenCount?: number;
    cacheWriteInputTokens?: number;
  };
  message?: string;
}

export enum BEDROCK_CONVERSE_STOP_REASON {
  end_turn = 'end_turn',
  tool_use = 'tool_use',
  max_tokens = 'max_tokens',
  stop_sequence = 'stop_sequence',
  guardrail_intervened = 'guardrail_intervened',
  content_filtered = 'content_filtered',
}

export enum TITAN_STOP_REASON {
  FINISHED = 'FINISHED',
  LENGTH = 'LENGTH',
  STOP_CRITERIA_MET = 'STOP_CRITERIA_MET',
  RAG_QUERY_WHEN_RAG_DISABLED = 'RAG_QUERY_WHEN_RAG_DISABLED',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
}
