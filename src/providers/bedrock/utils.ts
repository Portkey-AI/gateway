import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import {
  BedrockConverseAI21ChatCompletionsParams,
  BedrockConverseAnthropicChatCompletionsParams,
  BedrockChatCompletionsParams,
  BedrockConverseCohereChatCompletionsParams,
} from './chatComplete';

export const generateAWSHeaders = async (
  body: Record<string, any>,
  headers: Record<string, string>,
  url: string,
  method: string,
  awsService: string,
  awsRegion: string,
  awsAccessKeyID: string,
  awsSecretAccessKey: string,
  awsSessionToken: string | undefined
): Promise<Record<string, string>> => {
  const signer = new SignatureV4({
    service: awsService,
    region: awsRegion || 'us-east-1',
    credentials: {
      accessKeyId: awsAccessKeyID,
      secretAccessKey: awsSecretAccessKey,
      ...(awsSessionToken && { sessionToken: awsSessionToken }),
    },
    sha256: Sha256,
  });

  const urlObj = new URL(url);
  const hostname = urlObj.hostname;
  headers['host'] = hostname;
  const request = {
    method: method,
    path: urlObj.pathname,
    protocol: 'https',
    hostname: urlObj.hostname,
    headers: headers,
    body: JSON.stringify(body),
  };

  const signed = await signer.sign(request);
  return signed.headers;
};

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
  if (params['temperature']) {
    inferenceConfig['temperature'] = params['temperature'];
  }
  if (params['top_p']) {
    inferenceConfig['topP'] = params['top_p'];
  }
  return inferenceConfig;
};

export const transformAdditionalModelRequestFields = (
  params: BedrockChatCompletionsParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields || {};
  if (params['top_k']) {
    additionalModelRequestFields['top_k'] = params['top_k'];
  }
  return additionalModelRequestFields;
};

export const transformAnthropicAdditionalModelRequestFields = (
  params: BedrockConverseAnthropicChatCompletionsParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields || {};
  if (params['top_k']) {
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
  return additionalModelRequestFields;
};

export const transformCohereAdditionalModelRequestFields = (
  params: BedrockConverseCohereChatCompletionsParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields || {};
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
  if (params['stream']) {
    additionalModelRequestFields['stream'] = params['stream'];
  }
  return additionalModelRequestFields;
};

export const transformAI21AdditionalModelRequestFields = (
  params: BedrockConverseAI21ChatCompletionsParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields || {};
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
