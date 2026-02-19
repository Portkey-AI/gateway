import { logger } from '../../apm';
import {
  BedrockChatCompletionsParams,
  BedrockConverseAI21ChatCompletionsParams,
  BedrockConverseAnthropicChatCompletionsParams,
  BedrockConverseCohereChatCompletionsParams,
} from './chatComplete';
import fs from 'fs/promises';
import { BedrockFinetuneRecord, BedrockInferenceProfile } from './types';
import { externalServiceFetch } from '../../utils/fetch';
import { Environment } from '../../utils/env';
import { Options, Tool } from '../../types/requestBody';
import { BEDROCK } from '../../globals';
import {
  AWSCredentials,
  awsEndpointDomain,
  fetchECSContainerCredentials,
  fetchECSRegionFromMetadata,
  fetchECSTaskRoleArnFromMetadata,
  fetchIMDSAllCredentials,
  fetchPodIdentityCredentials,
  fetchSTSAssumeRoleCredentials,
  fetchWebIdentityCredentials,
  generateAWSHeaders,
  getCredentialsFromAwsConfigFile,
  getCredentialsFromEnvironment,
  getCredentialsFromSharedCredentialsFile,
  getRegionFromEnv,
} from '../../utils/awsAuth';
import { requestCache } from '../../services/cache/cacheService';

// Re-export for backward compatibility
export { awsEndpointDomain, generateAWSHeaders, getRegionFromEnv };

const CREDENTIAL_CACHE_TTL = 300; // 5 minutes

// Cached wrapper for Web Identity credentials
async function getAssumedWebIdentityCredentials(
  awsRegion?: string,
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  if (
    !Environment(env).AWS_WEB_IDENTITY_TOKEN_FILE ||
    !Environment(env).AWS_ROLE_ARN
  ) {
    return null;
  }

  try {
    const effectiveRegion = awsRegion || getRegionFromEnv(env) || 'us-east-1';
    const roleArn = Environment(env).AWS_ROLE_ARN;
    const cacheKey = `assumed-web-identity-${Environment({}).AWS_WEB_IDENTITY_TOKEN_FILE}-role-${roleArn}-region-${effectiveRegion}`;

    const cached = await requestCache(env).get<AWSCredentials>(cacheKey, {
      useLocalCache: true,
    });
    if (cached) {
      return cached;
    }

    const token = await fs.readFile(
      Environment(env).AWS_WEB_IDENTITY_TOKEN_FILE,
      'utf8'
    );

    const credentials = await fetchWebIdentityCredentials(
      token,
      roleArn,
      effectiveRegion
    );

    if (credentials) {
      const merged = {
        ...credentials,
        awsRoleArn: roleArn,
        awsRegion: effectiveRegion,
      };
      await requestCache(env).set(cacheKey, merged, {
        ttl: CREDENTIAL_CACHE_TTL,
      });
      return merged;
    }
  } catch (error) {
    logger.info({
      message: `Error from getAssumedWebIdentityCredentials: ${error}`,
    });
  }
  return null;
}

// Cached wrapper for Pod Identity credentials
async function getPodIdentityCredentials(
  awsRegion?: string,
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  if (
    !Environment(env).AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE ||
    !Environment(env).AWS_CONTAINER_CREDENTIALS_FULL_URI
  ) {
    return null;
  }

  try {
    const effectiveRegion = awsRegion || getRegionFromEnv() || 'us-east-1';
    const credentialFullUri =
      Environment(env).AWS_CONTAINER_CREDENTIALS_FULL_URI;
    const cacheKey = `assumed-pod-identity-${Environment(env).AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE}-region-${effectiveRegion}`;

    const cached = await requestCache(env).get<AWSCredentials>(cacheKey);
    if (cached) {
      return cached;
    }

    const token = await fs.readFile(
      Environment({}).AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE,
      'utf8'
    );

    const credentials = await fetchPodIdentityCredentials(
      token.trim(),
      credentialFullUri
    );

    if (credentials) {
      const result = {
        source: 'EKS Pod Identity',
        ...credentials,
        awsRegion: effectiveRegion,
      };
      await requestCache(env).set(cacheKey, result, {
        ttl: CREDENTIAL_CACHE_TTL,
      });
      return result;
    }
  } catch (error) {
    logger.info({
      message: `Failed to get Pod Identity credentials: ${error}`,
    });
  }
  return null;
}

async function getIRSACredentials(
  awsRegion?: string,
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  return getAssumedWebIdentityCredentials(awsRegion, env);
}

// Cached wrapper for ECS Container credentials
async function getCredentialsFromECSContainer(
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  if (!Environment(env).AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
    return null;
  }

  const cacheKey = `assumed-ecs-container-credentials`;
  const cached = await requestCache(env).get<AWSCredentials>(cacheKey, {
    useLocalCache: true,
  });
  if (cached) {
    return cached;
  }

  const credentials = await fetchECSContainerCredentials(
    Environment(env).AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
  );

  if (!credentials) {
    return null;
  }

  const derivedRegion =
    getRegionFromEnv(env) ||
    (await fetchECSRegionFromMetadata(env)) ||
    'us-east-1';

  const derivedRoleArn =
    credentials.awsRoleArn ||
    Environment(env).AWS_ROLE_ARN ||
    (await fetchECSTaskRoleArnFromMetadata(env));

  const result = {
    ...credentials,
    awsRoleArn: derivedRoleArn || undefined,
    awsRegion: derivedRegion,
  };

  await requestCache(env).set(cacheKey, result, { ttl: CREDENTIAL_CACHE_TTL });
  return result;
}

// Cached wrapper for IMDS credentials
async function getIMDSAssumedCredentials(
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  const cacheKey = `assumed-imds-credentials`;
  const cached = await requestCache(env).get<AWSCredentials>(cacheKey);
  if (cached) {
    return cached;
  }

  const credentials = await fetchIMDSAllCredentials(env);
  if (credentials) {
    await requestCache(env).set(cacheKey, credentials, {
      ttl: CREDENTIAL_CACHE_TTL,
    });
  }
  return credentials;
}

// Cached wrapper for STS AssumeRole credentials
async function getSTSAssumedCredentials(
  awsRoleArn: string,
  awsExternalId?: string,
  awsRegion?: string,
  accessKey?: string,
  secretKey?: string,
  sessionToken?: string,
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  const cacheKey = `assumed-sts-${awsRoleArn}/${awsExternalId}/${awsRegion}`;
  const cached = await requestCache(env).get<AWSCredentials>(cacheKey, {
    useLocalCache: true,
  });
  if (cached) {
    return cached;
  }

  const accessKeyId: string =
    accessKey || Environment(env).AWS_ASSUME_ROLE_ACCESS_KEY_ID || '';
  const secretAccessKey: string =
    secretKey || Environment(env).AWS_ASSUME_ROLE_SECRET_ACCESS_KEY || '';
  const region =
    awsRegion ||
    Environment(env).AWS_ASSUME_ROLE_REGION ||
    getRegionFromEnv() ||
    'us-east-1';

  const credentials = await fetchSTSAssumeRoleCredentials(
    awsRoleArn,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    awsExternalId
  );

  if (credentials) {
    const result = {
      ...credentials,
      awsRegion: region,
      awsRoleArn,
    };
    await requestCache(env).set(cacheKey, result, {
      ttl: CREDENTIAL_CACHE_TTL,
    });
    return result;
  }
  return null;
}

// Assumes the source/intermediate role if AWS_ASSUME_ROLE_SOURCE_ARN is configured
// Returns credentials from the source role, which can then be used to assume target roles
async function getSourceRoleCredentials(
  awsRegion?: string,
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  const sourceRoleArn = Environment(env).AWS_ASSUME_ROLE_SOURCE_ARN;
  const accessKeyId = Environment(env).AWS_ASSUME_ROLE_ACCESS_KEY_ID;
  const secretAccessKey = Environment(env).AWS_ASSUME_ROLE_SECRET_ACCESS_KEY;

  // Only attempt source role assumption if all required values are present
  if (!sourceRoleArn || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const sourceRoleExternalId =
    Environment(env).AWS_ASSUME_ROLE_SOURCE_EXTERNAL_ID || '';

  return getSTSAssumedCredentials(
    sourceRoleArn,
    sourceRoleExternalId,
    awsRegion,
    accessKeyId,
    secretAccessKey,
    undefined,
    env
  );
}

export async function getAssumedRoleCredentials(
  awsRoleArn?: string,
  awsExternalId?: string,
  awsRegion?: string,
  accessKey?: string,
  secretKey?: string,
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  let accessKeyId = accessKey;
  let secretAccessKey = secretKey;
  let sessionToken;

  // Source role assumption has highest priority (for role chaining)
  // When configured, use env credentials to assume source role first
  if (!accessKeyId && !secretAccessKey) {
    try {
      const sourceCredentials = await getSourceRoleCredentials(awsRegion, env);
      if (sourceCredentials) {
        accessKeyId = sourceCredentials.accessKeyId;
        secretAccessKey = sourceCredentials.secretAccessKey;
        sessionToken = sourceCredentials.sessionToken;
      }
    } catch (error) {
      logger.error('Error while assuming source role', error);
      return null;
    }
  }

  // Fall back to direct env credentials if source role not configured
  accessKeyId = accessKeyId || Environment(env).AWS_ASSUME_ROLE_ACCESS_KEY_ID;
  secretAccessKey =
    secretAccessKey || Environment(env).AWS_ASSUME_ROLE_SECRET_ACCESS_KEY;

  if (!accessKeyId && !secretAccessKey) {
    let credentials: AWSCredentials | undefined | null =
      getCredentialsFromEnvironment();

    if (!credentials) {
      credentials = await getCredentialsFromSharedCredentialsFile();
    }
    if (!credentials) {
      credentials = await getCredentialsFromAwsConfigFile();
    }
    if (!credentials) {
      try {
        credentials = await getIRSACredentials(awsRegion);
      } catch (error) {
        logger.error(error);
      }
    }
    if (!credentials) {
      try {
        credentials = await getPodIdentityCredentials(awsRegion);
      } catch (error) {
        logger.error(error);
      }
    }
    if (!credentials) {
      try {
        credentials = await getCredentialsFromECSContainer();
      } catch (error) {
        logger.error(error);
      }
    }
    if (!credentials) {
      try {
        credentials = await getIMDSAssumedCredentials();
      } catch (error) {
        logger.error(error);
      }
    }

    if (!awsRoleArn || credentials?.awsRoleArn === awsRoleArn) {
      return credentials || null;
    }

    accessKeyId = credentials?.accessKeyId;
    secretAccessKey = credentials?.secretAccessKey;
    sessionToken = credentials?.sessionToken;
  }

  if (!awsRoleArn) {
    return {
      accessKeyId: accessKeyId || '',
      secretAccessKey: secretAccessKey || '',
      sessionToken,
      awsRegion,
      awsRoleArn,
    };
  }

  return getSTSAssumedCredentials(
    awsRoleArn,
    awsExternalId,
    awsRegion,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    env
  );
}

export const transformInferenceConfig = (
  params: BedrockChatCompletionsParams
) => {
  const inferenceConfig: Record<string, any> = {};
  if (params['max_tokens'] || params['max_completion_tokens']) {
    inferenceConfig['maxTokens'] =
      params['max_tokens'] || params['max_completion_tokens'];
  }
  if (params['stop']) {
    inferenceConfig['stopSequences'] = params['stop'];
  }
  if (params['temperature'] !== undefined && params['temperature'] !== null) {
    inferenceConfig['temperature'] = params['temperature'];
  }
  if (params['top_p'] !== undefined && params['top_p'] !== null) {
    inferenceConfig['topP'] = params['top_p'];
  }
  return inferenceConfig;
};

export const transformAdditionalModelRequestFields = (
  params: BedrockChatCompletionsParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields ||
    params.additional_model_request_fields ||
    {};
  if (params['top_k'] !== undefined && params['top_k'] !== null) {
    additionalModelRequestFields['top_k'] = params['top_k'];
  }
  if (params['response_format']) {
    additionalModelRequestFields['response_format'] = params['response_format'];
  }
  return additionalModelRequestFields;
};

export const transformAnthropicAdditionalModelRequestFields = (
  params: BedrockConverseAnthropicChatCompletionsParams,
  providerOptions?: Options
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields ||
    params.additional_model_request_fields ||
    {};
  if (params['top_k'] !== undefined && params['top_k'] !== null) {
    additionalModelRequestFields['top_k'] = params['top_k'];
  }
  if (params['anthropic_version']) {
    additionalModelRequestFields['anthropic_version'] =
      params['anthropic_version'];
  }
  if (params['user']) {
    additionalModelRequestFields['metadata'] = {
      user_id: params['user'],
    };
  }
  if (params['thinking']) {
    additionalModelRequestFields['thinking'] = params['thinking'];
  }
  // Build output_config from OpenAI-compatible chat completions params.
  // response_format → output_config.format, reasoning_effort → output_config.effort
  {
    const outputConfig: Record<string, any> = {};
    if (params.response_format?.type === 'json_schema') {
      outputConfig.format = {
        type: 'json_schema',
        schema:
          params.response_format.json_schema?.schema ??
          params.response_format.json_schema,
      };
    }
    if (params['reasoning_effort']) {
      outputConfig.effort = params['reasoning_effort'];
    }
    if (Object.keys(outputConfig).length > 0) {
      additionalModelRequestFields['output_config'] = outputConfig;
    }
  }
  const anthropicBeta =
    providerOptions?.anthropicBeta || params['anthropic_beta'];
  if (anthropicBeta) {
    if (typeof anthropicBeta === 'string') {
      additionalModelRequestFields['anthropic_beta'] = anthropicBeta
        .split(',')
        .map((beta: string) => beta.trim());
    } else {
      additionalModelRequestFields['anthropic_beta'] = anthropicBeta;
    }
  }
  if (params.tools && params.tools.length) {
    const anthropicTools: any[] = [];
    params.tools.forEach((tool: Tool) => {
      if (tool.type !== 'function') {
        const toolOptions = tool[tool.type];
        anthropicTools.push({
          ...(toolOptions && { ...toolOptions }),
          name: tool.type,
          type: toolOptions?.name,
          ...(tool.cache_control && {
            cache_control: { type: 'ephemeral' },
          }),
        });
      }
    });
    if (anthropicTools.length) {
      additionalModelRequestFields['tools'] = anthropicTools;
    }
  }
  return additionalModelRequestFields;
};

export const transformCohereAdditionalModelRequestFields = (
  params: BedrockConverseCohereChatCompletionsParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields ||
    params.additional_model_request_fields ||
    {};
  if (params['top_k']) {
    additionalModelRequestFields['top_k'] = params['top_k'];
  }
  if (params['n']) {
    additionalModelRequestFields['n'] = params['n'];
  }
  if (params['frequency_penalty']) {
    additionalModelRequestFields['frequency_penalty'] =
      params['frequency_penalty'];
  }
  if (params['presence_penalty']) {
    additionalModelRequestFields['presence_penalty'] =
      params['presence_penalty'];
  }
  if (params['logit_bias']) {
    additionalModelRequestFields['logitBias'] = params['logit_bias'];
  }
  return additionalModelRequestFields;
};

export const transformAI21AdditionalModelRequestFields = (
  params: BedrockConverseAI21ChatCompletionsParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields ||
    params.additional_model_request_fields ||
    {};
  if (params['top_k']) {
    additionalModelRequestFields['top_k'] = params['top_k'];
  }
  if (params['frequency_penalty']) {
    additionalModelRequestFields['frequencyPenalty'] = {
      scale: params['frequency_penalty'],
    };
  }
  if (params['presence_penalty']) {
    additionalModelRequestFields['presencePenalty'] = {
      scale: params['presence_penalty'],
    };
  }
  if (params['frequencyPenalty']) {
    additionalModelRequestFields['frequencyPenalty'] =
      params['frequencyPenalty'];
  }
  if (params['presencePenalty']) {
    additionalModelRequestFields['presencePenalty'] = params['presencePenalty'];
  }
  if (params['countPenalty']) {
    additionalModelRequestFields['countPenalty'] = params['countPenalty'];
  }
  return additionalModelRequestFields;
};

export const bedrockFinetuneToOpenAI = (finetune: BedrockFinetuneRecord) => {
  let status = 'running';
  switch (finetune.status) {
    case 'Completed':
      status = 'succeeded';
      break;
    case 'Failed':
      status = 'failed';
      break;
    case 'InProgress':
      status = 'running';
      break;
    case 'Stopping':
    case 'Stopped':
      status = 'cancelled';
      break;
  }
  return {
    id: encodeURIComponent(finetune.jobArn ?? ''),
    job_name: finetune.jobName,
    object: 'finetune',
    status: status,
    created_at: new Date(finetune.creationTime).getTime(),
    finished_at: new Date(finetune.endTime).getTime(),
    fine_tuned_model:
      finetune.outputModelArn ||
      finetune.outputModelName ||
      finetune.customModelArn,
    suffix: finetune.customModelName,
    training_file: encodeURIComponent(
      finetune?.trainingDataConfig?.s3Uri ?? ''
    ),
    validation_file: encodeURIComponent(
      finetune?.validationDataConfig?.s3Uri ?? ''
    ),
    hyperparameters: {
      learning_rate_multiplier: Number(finetune?.hyperParameters?.learningRate),
      batch_size: Number(finetune?.hyperParameters?.batchSize),
      n_epochs: Number(finetune?.hyperParameters?.epochCount),
    },
    error: finetune?.failureMessage ?? {},
  };
};

export const getInferenceProfile = async (
  inferenceProfileIdentifier: string,
  providerOptions: Options,
  env: Record<string, any>
) => {
  if (providerOptions.awsAuthType === 'assumedRole') {
    const { accessKeyId, secretAccessKey, sessionToken } =
      (await getAssumedRoleCredentials(
        providerOptions.awsRoleArn || '',
        providerOptions.awsExternalId || '',
        providerOptions.awsRegion || '',
        undefined,
        undefined,
        env
      )) || {};
    providerOptions.awsAccessKeyId = accessKeyId;
    providerOptions.awsSecretAccessKey = secretAccessKey;
    providerOptions.awsSessionToken = sessionToken;
  } else if (providerOptions.awsAuthType === 'serviceRole') {
    const { accessKeyId, secretAccessKey, sessionToken, awsRegion } =
      (await getAssumedRoleCredentials(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        env
      )) || {};
    providerOptions.awsAccessKeyId = accessKeyId;
    providerOptions.awsSecretAccessKey = secretAccessKey;
    providerOptions.awsSessionToken = sessionToken;
    providerOptions.awsRegion = providerOptions.awsRegion || awsRegion;
  }

  const awsRegion = providerOptions.awsRegion || 'us-east-1';
  const awsAccessKeyId = providerOptions.awsAccessKeyId || '';
  const awsSecretAccessKey = providerOptions.awsSecretAccessKey || '';
  const awsSessionToken = providerOptions.awsSessionToken || '';

  const url = `https://bedrock.${awsRegion}.${awsEndpointDomain}/inference-profiles/${encodeURIComponent(decodeURIComponent(inferenceProfileIdentifier))}`;

  const headers = await generateAWSHeaders(
    undefined,
    { 'content-type': 'application/json' },
    url,
    'GET',
    'bedrock',
    awsRegion,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken
  );

  try {
    const response = await externalServiceFetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get inference profile: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as BedrockInferenceProfile;
  } catch (error) {
    console.error('Error getting inference profile:', error);
    throw error;
  }
};

export const getFoundationModelFromInferenceProfile = async (
  inferenceProfileIdentifier: string,
  providerOptions: Options,
  env: Record<string, any>
) => {
  try {
    const cacheKey = `bedrock-inference-profile-${inferenceProfileIdentifier}`;
    const cachedFoundationModel = await requestCache(env).get<string>(
      cacheKey,
      {
        useLocalCache: true,
      }
    );
    if (cachedFoundationModel) {
      return cachedFoundationModel;
    }

    const inferenceProfile = await getInferenceProfile(
      inferenceProfileIdentifier || '',
      { ...providerOptions },
      env
    );

    const foundationModel = inferenceProfile?.models?.[0]?.modelArn
      ?.split('/')
      ?.pop();
    await requestCache(env).set(cacheKey, foundationModel, {
      ttl: 56400,
    });
    return foundationModel;
  } catch (error) {
    logger.debug('Error mapping inference profile to foundation model:', error);
  }
};

export const getBedrockErrorChunk = (id: string, model: string) => {
  return [
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model,
      provider: BEDROCK,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            finish_reason: 'stop',
          },
        },
      ],
    })}\n\n`,
    `data: [DONE]\n\n`,
  ];
};

export function getS3EncryptionHeaders(env: Record<string, any>) {
  const {
    SSE_ENCRYPTION_TYPE: serverSideEncryption,
    KMS_KEY_ID: kmsKeyId,
    KMS_BUCKET_KEY_ENABLED: kmsBucketKeyEnabled,
    KMS_ENCRYPTION_CONTEXT: kmsEncryptionContext,
    KMS_ENCRYPTION_ALGORITHM: kmsEncryptionAlgorithm,
    KMS_ENCRYPTION_CUSTOMER_KEY: kmsEncryptionCustomerKey,
    KMS_ENCRYPTION_CUSTOMER_KEY_MD5: kmsEncryptionCustomerKeyMD5,
  } = Environment(env);
  return {
    ...(serverSideEncryption && {
      'x-amz-server-side-encryption': serverSideEncryption,
    }),
    ...(kmsKeyId && {
      'x-amz-server-side-encryption-aws-kms-key-id': kmsKeyId,
    }),
    ...(kmsBucketKeyEnabled &&
      kmsBucketKeyEnabled === 'true' && {
        'x-amz-server-side-encryption-bucket-key-enabled': true,
      }),
    ...(kmsEncryptionContext && {
      'x-amz-server-side-encryption-context': kmsEncryptionContext,
    }),
    ...(kmsEncryptionAlgorithm && {
      'x-amz-server-side-encryption-customer-algorithm': kmsEncryptionAlgorithm,
    }),
    ...(kmsEncryptionCustomerKey && {
      'x-amz-server-side-encryption-customer-key': kmsEncryptionCustomerKey,
    }),
    ...(kmsEncryptionCustomerKeyMD5 && {
      'x-amz-server-side-encryption-customer-key-MD5':
        kmsEncryptionCustomerKeyMD5,
    }),
  };
}

export const getBedrockFoundationModel = async (
  model: string,
  options: Options,
  env: Record<string, any>
) => {
  if (model.includes('arn:aws')) {
    const foundationModel = model.includes('foundation-model/')
      ? model.split('/').pop()
      : await getFoundationModelFromInferenceProfile(model, options, env);
    if (foundationModel) {
      return foundationModel;
    }
    return model;
  }
  return model;
};

export const getBedrockModelWithoutRegion = (model: string) => {
  return model.replace(/^(us\.|eu\.|apac\.|au\.|ca\.|jp\.|global\.)/, '');
};
