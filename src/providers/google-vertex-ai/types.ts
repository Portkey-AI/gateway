import { ChatCompletionResponse, GroundingMetadata } from '../types';

export interface GoogleErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details: Array<Record<string, any>>;
  };
}

export interface GoogleGenerateFunctionCall {
  name: string;
  args: Record<string, any>;
}

export interface GoogleResponseCandidate {
  content: {
    parts: {
      text?: string;
      thought?: string; // for models like gemini-2.0-flash-thinking-exp refer: https://ai.google.dev/gemini-api/docs/thinking-mode#streaming_model_thinking
      functionCall?: GoogleGenerateFunctionCall;
    }[];
  };
  logprobsResult?: {
    topCandidates: [
      {
        candidates: [
          {
            token: string;
            logProbability: number;
          },
        ];
      },
    ];
    chosenCandidates: [
      {
        token: string;
        logProbability: number;
      },
    ];
  };
  finishReason: string;
  index: 0;
  safetyRatings: {
    category: string;
    probability: string;
  }[];
  groundingMetadata?: GroundingMetadata;
}

export interface GoogleGenerateContentResponse {
  modelVersion: string;
  candidates: GoogleResponseCandidate[];
  promptFeedback: {
    safetyRatings: {
      category: string;
      probability: string;
      probabilityScore: number;
      severity: string;
      severityScore: number;
    }[];
  };
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface VertexLLamaChatCompleteResponse
  extends Omit<ChatCompletionResponse, 'id' | 'created'> {}

export interface VertexLlamaChatCompleteStreamChunk {
  choices: {
    delta: {
      content: string;
      role: string;
    };
    finish_reason?: string;
    index: 0;
  }[];
  model: string;
  object: string;
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
  id?: string;
  created?: number;
  provider?: string;
}

export interface EmbedInstancesData {
  task_type: string;
  content: string;
}

interface EmbedPredictionsResponse {
  embeddings: {
    values: number[];
    statistics: {
      truncated: string;
      token_count: number;
    };
  };
}

export interface GoogleEmbedResponse {
  predictions: EmbedPredictionsResponse[];
  metadata: {
    billableCharacterCount: number;
  };
}

export interface GoogleSearchRetrievalTool {
  googleSearchRetrieval: {
    dynamicRetrievalConfig?: {
      mode: string;
      dynamicThreshold?: string;
    };
  };
}

type GoogleBatchJobStatus =
  | 'JOB_STATE_UNSPECIFIED'
  | 'JOB_STATE_QUEUED'
  | 'JOB_STATE_PENDING'
  | 'JOB_STATE_RUNNING'
  | 'JOB_STATE_SUCCEEDED'
  | 'JOB_STATE_FAILED'
  | 'JOB_STATE_CANCELLING'
  | 'JOB_STATE_CANCELLED'
  | 'JOB_STATE_PAUSED'
  | 'JOB_STATE_EXPIRED'
  | 'JOB_STATE_UPDATING'
  | 'JOB_STATE_PARTIALLY_SUCCEEDED';

export interface GoogleBatchRecord {
  /**
   * @example projects/562188160088/locations/us-east4/batchPredictionJobs/{id}
   */
  name: string;
  displayName: string;
  /**
   * @example projects/562188160088/locations/us-east4/models/{model}
   */
  model: string;
  inputConfig: {
    instancesFormat: 'jsonl';
    gcsSource: {
      uris: string;
    };
  };
  outputConfig: {
    predictionsFormat: 'jsonl';
    gcsDestination: {
      outputUriPrefix: string;
    };
  };
  outputInfo?: {
    gcsOutputDirectory: string;
  };
  state: GoogleBatchJobStatus;
  createTime: string;
  updateTime: string;
  modelVersionId: string;
  error?: {
    code: string;
    message: string;
  };
  startTime: string;
  endTime: string;
  completionsStats?: {
    successfulCount: string;
    failedCount: string;
    incompleteCount: string;
    successfulForecastPointCount: string;
  };
}

export interface GoogleFinetuneRecord {
  name: string;
  state: GoogleBatchJobStatus;
  tunedModelDisplayName: string;
  description: string;
  createTime: string;
  startTime: string;
  endTime: string;
  updateTime: string;
  error: string;
  tunedModel?: {
    model: string;
    endpoint: string;
  };
  tuningDataStats?: {
    supervisedTuningDataStats: {
      tuningDatasetExampleCount: number;
      totalTuningCharacterCount: number;
      totalBillableTokenCount: number;
      tuningStepCount: number;
      userInputTokenDistribution: number;
    };
  };
  baseModel: string;
  source_model?: {
    baseModel: string;
  };
  supervisedTuningSpec: {
    trainingDatasetUri: string;
    validationDatasetUri: string;
    hyperParameters: {
      learningRateMultiplier: number;
      epochCount: number;
      adapterSize: number;
    };
  };
}
