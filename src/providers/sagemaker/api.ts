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

    if (providerOptions.amznSagemakerCustomAttributes) {
      awsHeaders['x-amzn-sagemaker-custom-attributes'] =
        providerOptions.amznSagemakerCustomAttributes;
    }

    if (providerOptions.amznSagemakerTargetModel) {
      awsHeaders['x-amzn-sagemaker-target-model'] =
        providerOptions.amznSagemakerTargetModel;
    }

    if (providerOptions.amznSagemakerTargetVariant) {
      awsHeaders['x-amzn-sagemaker-target-variant'] =
        providerOptions.amznSagemakerTargetVariant;
    }

    if (providerOptions.amznSagemakerTargetContainerHostname) {
      awsHeaders['x-amzn-sagemaker-target-container-hostname'] =
        providerOptions.amznSagemakerTargetContainerHostname;
    }

    if (providerOptions.amznSagemakerInferenceId) {
      awsHeaders['x-amzn-sagemaker-inference-id'] =
        providerOptions.amznSagemakerInferenceId;
    }

    if (providerOptions.amznSagemakerEnableExplanations) {
      awsHeaders['x-amzn-sagemaker-enable-explanations'] =
        providerOptions.amznSagemakerEnableExplanations;
    }

    if (providerOptions.amznSagemakerInferenceComponent) {
      awsHeaders['x-amzn-sagemaker-inference-component'] =
        providerOptions.amznSagemakerInferenceComponent;
    }

    if (providerOptions.amznSagemakerSessionId) {
      awsHeaders['x-amzn-sagemaker-session-id'] =
        providerOptions.amznSagemakerSessionId;
    }
    return awsHeaders;
  },
  getEndpoint: ({ gatewayRequestURL }) => gatewayRequestURL.split('/v1')[1],
};

export default SagemakerAPIConfig;
