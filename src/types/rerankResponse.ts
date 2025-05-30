import { BaseResponse } from '../providers/types';

export interface RerankResponseData {
  index: number; // The index of the document in the input list
  relevance_score: number; // The relevance score of the document
  document: string; // The document string
}

export interface RerankResponse extends BaseResponse {
  object: string; // The type of object returned, e.g., "list"
  data: RerankResponseData[]; // The list of data objects
  model: string; // Name of the model
  usage: {
    total_tokens: number; // The total number of tokens used for computing the reranking
  };
}
