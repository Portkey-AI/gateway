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
export enum BEDROCK_CONVERSE_STOP_REASON {
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
  message?: string;
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
}

export enum TITAN_STOP_REASON {
  FINISHED = 'FINISHED',
  LENGTH = 'LENGTH',
  STOP_CRITERIA_MET = 'STOP_CRITERIA_MET',
  RAG_QUERY_WHEN_RAG_DISABLED = 'RAG_QUERY_WHEN_RAG_DISABLED',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
}

// ==================== Rerank Types ====================

/**
 * Bedrock Rerank API Request
 * https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Rerank.html
 */
export interface BedrockRerankRequest {
  /** Array of query objects (fixed to 1 item) */
  queries: BedrockRerankQuery[];
  /** Array of source documents to rerank (1-1000 items) */
  sources: BedrockRerankSource[];
  /** Reranking configuration */
  rerankingConfiguration: BedrockRerankingConfiguration;
  /** Pagination token for next batch of results */
  nextToken?: string;
}

export interface BedrockRerankQuery {
  /** Query type */
  type: 'TEXT';
  /** Text query object */
  textQuery: {
    text: string;
  };
}

export interface BedrockRerankSource {
  /** Source type */
  type: 'INLINE';
  /** Inline document source */
  inlineDocumentSource: {
    /** Document type */
    type: 'TEXT' | 'JSON';
    /** Text document */
    textDocument?: {
      text: string;
    };
    /** JSON document */
    jsonDocument?: Record<string, any>;
  };
}

export interface BedrockRerankingConfiguration {
  /** Configuration type */
  type: 'BEDROCK_RERANKING_MODEL';
  /** Bedrock-specific reranking configuration */
  bedrockRerankingConfiguration: {
    /** Model configuration */
    modelConfiguration: {
      /** Model ARN */
      modelArn: string;
      /** Additional model request fields */
      additionalModelRequestFields?: Record<string, any>;
    };
    /** Number of results to return */
    numberOfResults?: number;
  };
}

/**
 * Bedrock Rerank API Response
 */
export interface BedrockRerankResponse {
  /** Array of reranked results */
  results?: BedrockRerankResult[];
  /** Pagination token for next batch */
  nextToken?: string;
  /** Error message */
  message?: string;
}

export interface BedrockRerankResult {
  /** Position in the original source list */
  index: number;
  /** Relevance score */
  relevanceScore: number;
  /** Document content (if returned) */
  document?: {
    type: string;
    textDocument?: {
      text: string;
    };
    jsonDocument?: Record<string, any>;
  };
}
