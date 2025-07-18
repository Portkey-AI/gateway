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

export enum BEDROCK_STOP_REASON {
  end_turn = 'end_turn',
  tool_use = 'tool_use',
  max_tokens = 'max_tokens',
  stop_sequence = 'stop_sequence',
  guardrail_intervened = 'guardrail_intervened',
  content_filtered = 'content_filtered',
}
