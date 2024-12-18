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
