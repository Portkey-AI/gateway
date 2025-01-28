import { ChatCompletionResponse } from '../types';

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
  groundingMetadata?: {
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
  };
}

export interface GoogleGenerateContentResponse {
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
