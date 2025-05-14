import { BaseResponse } from '../providers/types';
import { Options } from './requestBody';

type EmbedInput = {
  text?: string;
  image?: {
    url?: string;
    base64?: string;
    text?: string; // used for image captioning
  };
  video?: {
    url?: string;
    base64?: string;
    start_offset?: number;
    end_offset?: number;
    interval?: number;
    text?: string; // used for video captioning
  };
};

export interface EmbedParams {
  model: string; // The model name to be used as the embedding model
  input: string | string[] | EmbedInput[]; // The text or texts to be embedded
  user: string; // An identifier for the user making the request
  dimensions?: number; // The number of dimensions the resulting output embeddings should have
}

export interface EmbedRequestBody {
  config: {
    provider?: string; // The provider of the AI model, e.g., "anthropic", "cohere", "openai"
    apiKeyName?: string; // The API key name of the provider
    apiKey?: string; // The API key of the provider
    mode?: string;
    options?: Options[];
  };
  params: EmbedParams;
}

export interface EmbedResponseData {
  object: string; // The type of data object, e.g., "embedding"
  embedding?: number[] | number[][]; // The embedding vector(s)
  image_embedding?: number[];
  video_embeddings?: {
    start_offset: number;
    end_offset?: number;
    embedding: number[];
  }[];
  index: number; // The index of the data object
}

export interface EmbedResponse extends BaseResponse {
  object: string; // The type of object returned, e.g., "list"
  data: EmbedResponseData[]; // The list of data objects
  model: string; // The model used to generate the embedding
  usage: {
    prompt_tokens: number; // The number of tokens in the prompt
    total_tokens: number; // The total number of tokens used
  };
}
