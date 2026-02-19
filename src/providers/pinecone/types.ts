// ==================== Rerank Types ====================

/**
 * Pinecone Rerank API Request
 * https://docs.pinecone.io/reference/api/2024-10/inference/rerank
 */
export interface PineconeRerankRequest {
  /** The identifier of the model to use */
  model: string;
  /** The search query */
  query: string;
  /** A list of documents to rerank (objects with id and text fields) */
  documents: PineconeRerankDocument[];
  /** The number of most relevant documents to return */
  top_n?: number;
  /** Whether to return the document text in the response */
  return_documents?: boolean;
  /** Fields to use for ranking */
  rank_fields?: string[];
  /** Additional parameters for the model */
  parameters?: Record<string, any>;
}

export interface PineconeRerankDocument {
  /** Document ID */
  id: string;
  /** Document text */
  text: string;
  /** Additional fields */
  [key: string]: any;
}

/**
 * Pinecone Rerank API Response
 */
export interface PineconeRerankResponse {
  /** Model used for reranking */
  model?: string;
  /** Array of reranked results */
  data?: PineconeRerankResult[];
  /** Usage information */
  usage?: PineconeRerankUsage;
  /** Error message */
  message?: string;
  /** Error object */
  error?: {
    message: string;
    code?: string;
  };
}

export interface PineconeRerankUsage {
  /** Rerank units used */
  rerank_units?: number;
}

export interface PineconeRerankResult {
  /** Position in the original document list */
  index: number;
  /** Relevance score */
  score: number;
  /** Document object (if return_documents=true) */
  document?: {
    text: string;
    [key: string]: any;
  };
}
