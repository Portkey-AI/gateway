import {
  awsEndpointDomain,
  generateAWSHeaders,
  getAssumedRoleCredentials,
  getRegionFromEnv,
} from '../bedrock/utils';
import { ProviderAPIConfig } from '../types';
const SagemakerAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    if (providerOptions.awsAuthType === 'serviceRole') {
      providerOptions.awsRegion =
        providerOptions.awsRegion || getRegionFromEnv();
    }
    return `https://runtime.sagemaker.${providerOptions.awsRegion}.${awsEndpointDomain}`;
  },
  headers: async ({
    providerOptions,
    transformedRequestBody,
    transformedRequestUrl,
  }) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (providerOptions.awsAuthType === 'assumedRole') {
      const { accessKeyId, secretAccessKey, sessionToken } =
        (await getAssumedRoleCredentials(
          providerOptions.awsRoleArn || '',
          providerOptions.awsExternalId || '',
          providerOptions.awsRegion || ''
        )) || {};
      providerOptions.awsAccessKeyId = accessKeyId;
      providerOptions.awsSecretAccessKey = secretAccessKey;
      providerOptions.awsSessionToken = sessionToken;
    } else if (providerOptions.awsAuthType === 'serviceRole') {
      const assumedCreds = await getAssumedRoleCredentials();
      if (assumedCreds) {
        providerOptions.awsAccessKeyId = assumedCreds.accessKeyId;
        providerOptions.awsSecretAccessKey = assumedCreds.secretAccessKey;
        providerOptions.awsSessionToken = assumedCreds.sessionToken;
        // Only fallback to credentials region if user didn't specify one (for cross-region support)
        providerOptions.awsRegion =
          providerOptions.awsRegion || assumedCreds.awsRegion;
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
