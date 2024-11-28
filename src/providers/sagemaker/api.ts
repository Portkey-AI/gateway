import { GatewayError } from '../../errors/GatewayError';
import {
  generateAWSHeaders,
  getAssumedRoleCredentials,
} from '../bedrock/utils';
import { ProviderAPIConfig } from '../types';
import { env } from 'hono/adapter';
const SagemakerAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return `https://runtime.sagemaker.${providerOptions.awsRegion}.amazonaws.com`;
  },
  headers: async ({
    providerOptions,
    transformedRequestBody,
    transformedRequestUrl,
    c,
  }) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (providerOptions.awsAuthType === 'assumedRole') {
      try {
        // Assume the role in the source account
        const sourceRoleCredentials = await getAssumedRoleCredentials(
          c,
          env(c).AWS_ASSUME_ROLE_SOURCE_ARN, // Role ARN in the source account
          env(c).AWS_ASSUME_ROLE_SOURCE_EXTERNAL_ID || '', // External ID for source role (if needed)
          providerOptions.awsRegion || ''
        );

        if (!sourceRoleCredentials) {
          throw new Error('Server Error while assuming internal role');
        }

        // Assume role in destination account using temporary creds obtained in first step
        const { accessKeyId, secretAccessKey, sessionToken } =
          (await getAssumedRoleCredentials(
            c,
            providerOptions.awsRoleArn || '',
            providerOptions.awsExternalId || '',
            providerOptions.awsRegion || '',
            {
              accessKeyId: sourceRoleCredentials.accessKeyId,
              secretAccessKey: sourceRoleCredentials.secretAccessKey,
              sessionToken: sourceRoleCredentials.sessionToken,
            }
          )) || {};
        providerOptions.awsAccessKeyId = accessKeyId;
        providerOptions.awsSecretAccessKey = secretAccessKey;
        providerOptions.awsSessionToken = sessionToken;
      } catch (e) {
        throw new GatewayError('Error while assuming sagemaker role');
      }
    }

    const awsHeaders = await generateAWSHeaders(
      transformedRequestBody,
      headers,
      transformedRequestUrl,
      'POST',
      'sagemaker',
      providerOptions.awsRegion || '',
      providerOptions.awsAccessKeyId || '',
      providerOptions.awsSecretAccessKey || '',
      providerOptions.awsSessionToken || ''
    );

    if (providerOptions.sagemakerCustomAttributes) {
      awsHeaders['x-amzn-sagemaker-custom-attributes'] =
        providerOptions.sagemakerCustomAttributes;
    }

    if (providerOptions.sagemakerTargetModel) {
      awsHeaders['x-amzn-sagemaker-target-model'] =
        providerOptions.sagemakerTargetModel;
    }

    if (providerOptions.sagemakerTargetVariant) {
      awsHeaders['x-amzn-sagemaker-target-variant'] =
        providerOptions.sagemakerTargetVariant;
    }

    if (providerOptions.sagemakerTargetContainerHostname) {
      awsHeaders['x-amzn-sagemaker-target-container-hostname'] =
        providerOptions.sagemakerTargetContainerHostname;
    }

    if (providerOptions.sagemakerInferenceId) {
      awsHeaders['x-amzn-sagemaker-inference-id'] =
        providerOptions.sagemakerInferenceId;
    }

    if (providerOptions.sagemakerEnableExplanations) {
      awsHeaders['x-amzn-sagemaker-enable-explanations'] =
        providerOptions.sagemakerEnableExplanations;
    }

    if (providerOptions.sagemakerInferenceComponent) {
      awsHeaders['x-amzn-sagemaker-inference-component'] =
        providerOptions.sagemakerInferenceComponent;
    }

    if (providerOptions.sagemakerSessionId) {
      awsHeaders['x-amzn-sagemaker-session-id'] =
        providerOptions.sagemakerSessionId;
    }
    return awsHeaders;
  },
  getEndpoint: ({ gatewayRequestURL }) => gatewayRequestURL.split('/v1')[1],
};

export default SagemakerAPIConfig;
