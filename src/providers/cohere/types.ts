export type CohereStreamState = {
  generation_id: string;
  lastIndex: number;
};

export interface CohereErrorResponse {
  message: string;
}

export type CohereDatasetUploadStatus =
  | string
  | 'unknown'
  | 'queued'
  | 'processing'
  | 'failed'
  | 'validated'
  | 'skipped';

export interface CohereDataset {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  dataset_type:
    | string
    | 'embed-input'
    | 'reranker-finetune-input'
    | 'single-label-classification-finetune-input'
    | 'chat-finetune-input'
    | 'multi-label-classification-finetune-input';
  validation_status: CohereDatasetUploadStatus;
  validation_error: string;
  schema: string;
  required_fields: string[];
  preserve_fields: string[];
  dataset_parts: {
    id: string;
    name: string;
    url: string;
    size_bytes: number;
    num_rows: number;
    samples: string[];
  }[];
  validation_warnings: string[];
}

export interface CohereGetFileResponse {
  dataset: CohereDataset;
}

export interface CohereGetFilesResponse {
  datasets: CohereDataset[];
}

interface CohereBatchMeta {
  api_version: {
    version: string;
    is_deprecated: boolean;
    is_experimental: boolean;
  };
  billed_units: {
    images: number;
    input_tokens: number;
    output_tokens: number;
    search_units: number;
    classifications: number;
  };
  tokens: {
    input_tokens: number;
    output_tokens: number;
  };
  warnings: string[];
}

export interface CohereCreateBatchResponse {
  job_id: string;
  meta: CohereBatchMeta;
}

export interface CohereBatch {
  job_id: string;
  status:
    | string
    | 'processing'
    | 'complete'
    | 'cancelling'
    | 'cancelled'
    | 'failed';
  created_at: string;
  input_dataset_id: string;
  model: string;
  truncate: string | 'START' | 'END';
  name: string;
  output_dataset_id: string;
  meta: CohereBatchMeta;
}

export interface CohereListBatchResponse {
  embed_jobs: CohereBatch[];
}

export interface CohereRetrieveBatchResponse extends CohereBatch {}

export enum COHERE_STOP_REASON {
  complete = 'COMPLETE',
  stop_sequence = 'STOP_SEQUENCE',
  max_tokens = 'MAX_TOKENS',
  tool_call = 'TOOL_CALL',
  error = 'ERROR',
  timeout = 'TIMEOUT',
}

export type CohereChatCompletionStreamChunk =
  | V2ChatStreamResponse.MessageStart
  | V2ChatStreamResponse.ContentStart
  | V2ChatStreamResponse.ContentDelta
  | V2ChatStreamResponse.ContentEnd
  | V2ChatStreamResponse.ToolPlanDelta
  | V2ChatStreamResponse.ToolCallStart
  | V2ChatStreamResponse.ToolCallDelta
  | V2ChatStreamResponse.ToolCallEnd
  | V2ChatStreamResponse.CitationStart
  | V2ChatStreamResponse.CitationEnd
  | V2ChatStreamResponse.MessageEnd
  | V2ChatStreamResponse.Debug;

type ChatContentStartEventDeltaMessageContentType = 'text' | 'thinking';

export interface LogprobItem {
  /** The text chunk for which the log probabilities was calculated. */
  text?: string;
  /** The token ids of each token used to construct the text chunk. */
  tokenIds: number[];
  /** The log probability of each token used to construct the text chunk. */
  logprobs?: number[];
}

export interface ToolCallV2Function {
  name?: string;
  arguments?: string;
}

export interface ToolCallV2 {
  id?: string;
  type?: 'function';
  function?: ToolCallV2Function;
}

export interface UsageBilledUnits {
  /** The number of billed input tokens. */
  input_tokens?: number;
  /** The number of billed output tokens. */
  output_tokens?: number;
  /** The number of billed search units. */
  search_units?: number;
  /** The number of billed classifications units. */
  classifications_units?: number;
}

export interface UsageTokens {
  /** The number of tokens used as input to the model. */
  input_tokens?: number;
  /** The number of tokens produced by the model. */
  output_tokens?: number;
}

export interface Usage {
  billed_units?: UsageBilledUnits;
  tokens?: UsageTokens;
}

export interface Citation {
  /** Start index of the cited snippet in the original source text. */
  start?: number;
  /** End index of the cited snippet in the original source text. */
  end?: number;
  /** Text snippet that is being cited. */
  text?: string;
  sources?: any;
  /** Index of the content block in which this citation appears. */
  content_index?: number;
  type?: any;
}

namespace V2ChatStreamResponse {
  export interface MessageStart {
    type: 'message-start';
    id: string;
    delta?: {
      message: {
        role: 'assistant';
      };
    };
  }

  export interface ContentStart {
    type: 'content-start';
    index: number;
    delta?: {
      message: {
        content: {
          thinking?: string;
          text?: string;
          type?: ChatContentStartEventDeltaMessageContentType;
        };
      };
    };
  }

  export interface ContentDelta {
    type: 'content-delta';
    index: number;
    delta?: {
      message: {
        content: {
          thinking?: string;
          text?: string;
        };
      };
    };
    logprobs?: LogprobItem;
  }

  export interface ContentEnd {
    type: 'content-end';
    index?: number;
  }

  export interface ToolPlanDelta {
    type: 'tool-plan-delta';
    index: number;
    delta: {
      message: {
        tool_plan: string;
      };
    };
  }

  export interface ToolCallStart {
    type: 'tool-call-start';
    index: number;
    delta: {
      message: {
        tool_calls: ToolCallV2;
      };
    };
  }

  export interface ToolCallDelta {
    type: 'tool-call-delta';
    index: number;
    delta: {
      message: {
        tool_calls: ToolCallV2;
      };
    };
  }

  export interface ToolCallEnd {
    type: 'tool-call-end';
    index: number;
  }

  export interface CitationStart {
    type: 'citation-start';
    index: number;
    delta?: {
      message?: {
        citations: Citation;
      };
    };
  }

  export interface CitationEnd {
    type: 'citation-end';
    index: number;
  }

  export interface MessageEnd {
    type: 'message-end';
    id?: string;
    delta?: {
      error?: string;
      finish_reason?: COHERE_STOP_REASON;
      usage?: Usage;
    };
  }

  export interface Debug {
    type: 'debug';
    prompt?: string;
  }
}
export interface CohereChatCompleteResponse {
  id: string;
  finish_reason: string;
  message: {
    role: 'assistant';
    tool_calls: any[];
    tool_plan: string;
    content:
      | {
          type: 'text';
          text: string;
        }[]
      | {
          thinking: string;
          type: 'thinking';
        }[];
    citations: any;
  };
  usage: {
    billed_units?: {
      input_tokens?: number;
      output_tokens?: number;
    };
    tokens?: {
      input_tokens?: number;
      output_tokens?: number;
    };
    cached_tokens?: number;
  };
}
export interface CohereErrorResponse {
  message: string;
  id: string;
}
