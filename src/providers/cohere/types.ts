export type CohereStreamState = {
  generation_id: string;
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
