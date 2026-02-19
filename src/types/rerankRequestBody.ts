import { BaseResponse } from '../providers/types';

/**
 * Document input for reranking
 * Can be a string or an object with text field
 */
export type RerankDocument = string | { text: string; [key: string]: any };

/**
 * Parameters for rerank request
 * Based on Cohere's API signature as the base
 */
export interface RerankParams {
  /** The model to use for reranking */
  model: string;
  /** The search query to compare against documents */
  query: string;
  /** List of documents to rerank */
  documents: RerankDocument[];
  /** Number of top results to return (optional, returns all if not specified) */
  top_n?: number;
  /** Whether to return document text in response (provider specific) */
  return_documents?: boolean;
  /** Maximum tokens per document - Cohere specific */
  max_tokens_per_doc?: number;
  /** Priority of request - Cohere specific */
  priority?: number;
  /** Fields to use for ranking - Pinecone specific */
  rank_fields?: string[];
  /** Whether to truncate documents exceeding max length - Voyage specific */
  truncation?: boolean;
  /** Additional parameters - Pinecone specific */
  parameters?: Record<string, any>;
}

/**
 * Single result in rerank response
 */
export interface RerankResult {
  /** Index of the document in the original input array */
  index: number;
  /** Relevance score (higher is more relevant) */
  relevance_score: number;
  /** Original document text (only present if return_documents=true) */
  document?: { text: string; [key: string]: any };
}

/**
 * Usage information for rerank request
 */
export interface RerankUsage {
  /** Search units billed (Cohere/Pinecone specific) */
  search_units?: number;
}

/**
 * Standardized rerank response following Cohere-like structure
 */
export interface RerankResponse extends BaseResponse {
  /** Response object type */
  object: string;
  /** Unique identifier for the request */
  id?: string;
  /** Array of reranked results sorted by relevance */
  results: RerankResult[];
  /** Model used for reranking */
  model: string;
  /** Usage/billing information */
  usage?: RerankUsage;
  /** Provider name */
  provider?: string;
}
