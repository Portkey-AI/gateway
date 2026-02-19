// ==================== Rerank Types ====================

/**
 * Voyage Rerank API Request
 * https://docs.voyageai.com/reference/reranker-api
 */
export interface VoyageRerankRequest {
  /** The identifier of the model to use */
  model: string;
  /** The search query (max tokens varies by model) */
  query: string;
  /** A list of document strings to rerank (max 1000 documents) */
  documents: string[];
  /** The number of most relevant documents to return (defaults to all) */
  top_k?: number;
  /** Whether to return the document text in the response */
  return_documents?: boolean;
  /** Whether to truncate inputs exceeding context length (defaults to true) */
  truncation?: boolean;
}

/**
 * Voyage Rerank API Response
 */
export interface VoyageRerankResponse {
  /** Object type */
  object?: string;
  /** Array of reranked results sorted by relevance score descending */
  data?: VoyageRerankResult[];
  /** Model used for reranking */
  model?: string;
  /** Usage information */
  usage?: VoyageRerankUsage;
  /** Error detail message */
  detail?: string;
  /** Error message */
  message?: string;
}

export interface VoyageRerankUsage {
  /** Total tokens used */
  total_tokens?: number;
}

export interface VoyageRerankResult {
  /** Position in the original document list */
  index: number;
  /** Relevance score */
  relevance_score: number;
  /** Document text (if return_documents=true) */
  document?: string;
}
