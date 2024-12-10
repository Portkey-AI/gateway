interface BedrockCreateBatchResponse {
  jobArn: string;
}

export interface BedrockGetBatchResponse {
  clientRequestToken: string;
  endTime: string;
  inputDataConfig: {
    s3Uri: string;
    s3KeyPrefix: string;
  };
  jobArn: string;
  jobExpirationTime: string;
  jobName: string;
  lastModifiedTime: string;
  message: string;
  modelId: string;
  outputDataConfig: {
    s3Uri: string;
    s3KeyPrefix: string;
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
