import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import {
  BedrockConverseAI21ChatCompletionsParams,
  BedrockConverseAnthropicChatCompletionsParams,
  BedrockChatCompletionsParams,
  BedrockConverseCohereChatCompletionsParams,
} from './chatComplete';
import { Context } from 'hono';
import { env } from 'hono/adapter';

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

export async function getAssumedRoleCredentials(
  c: Context,
  awsRoleArn: string,
  awsExternalId: string,
  awsRegion: string,
  creds?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }
) {
  const cacheKey = `${awsRoleArn}/${awsExternalId}/${awsRegion}`;
  const getFromCacheByKey = c.get('getFromCacheByKey');
  const putInCacheWithValue = c.get('putInCacheWithValue');

  const resp = getFromCacheByKey
    ? await getFromCacheByKey(env(c), cacheKey)
    : null;
  if (resp) {
    return resp;
  }

  // Determine which credentials to use
  let accessKeyId: string;
  let secretAccessKey: string;
  let sessionToken: string | undefined;

  if (creds) {
    // Use provided credentials
    accessKeyId = creds.accessKeyId;
    secretAccessKey = creds.secretAccessKey;
    sessionToken = creds.sessionToken;
  } else {
    // Use environment credentials
    const { AWS_ASSUME_ROLE_ACCESS_KEY_ID, AWS_ASSUME_ROLE_SECRET_ACCESS_KEY } =
      env(c);
    accessKeyId = AWS_ASSUME_ROLE_ACCESS_KEY_ID || '';
    secretAccessKey = AWS_ASSUME_ROLE_SECRET_ACCESS_KEY || '';
  }

  const region = awsRegion || 'us-east-1';
  const service = 'sts';
  const hostname = `sts.${region}.amazonaws.com`;
  const signer = new SignatureV4({
    service,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    },
    sha256: Sha256,
  });
  const date = new Date();
  const sessionName = `${date.getFullYear()}${date.getMonth()}${date.getDay()}`;
  const url = `https://${hostname}?Action=AssumeRole&Version=2011-06-15&RoleArn=${awsRoleArn}&RoleSessionName=${sessionName}${awsExternalId ? `&ExternalId=${awsExternalId}` : ''}`;
  const urlObj = new URL(url);
  const requestHeaders = { host: hostname };
  const options = {
    method: 'GET',
    path: urlObj.pathname,
    protocol: urlObj.protocol,
    hostname: urlObj.hostname,
    headers: requestHeaders,
    query: Object.fromEntries(urlObj.searchParams),
  };
  const { headers } = await signer.sign(options);

  let credentials: any;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      const resp = await response.text();
      console.error({ message: resp });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlData = await response.text();
    credentials = parseXml(xmlData);
    if (putInCacheWithValue) {
      putInCacheWithValue(env(c), cacheKey, credentials, 60); //1 minute
    }
  } catch (error) {
    console.error({ message: `Error assuming role:, ${error}` });
  }
  return credentials;
}

function parseXml(xml: string) {
  // Simple XML parser for this specific use case
  const getTagContent = (tag: string) => {
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
    const match = xml.match(regex);
    return match ? match[1] : null;
  };

  const credentials = getTagContent('Credentials');
  if (!credentials) {
    throw new Error('Failed to parse Credentials from XML response');
  }

  return {
    accessKeyId: getTagContent('AccessKeyId'),
    secretAccessKey: getTagContent('SecretAccessKey'),
    sessionToken: getTagContent('SessionToken'),
    expiration: getTagContent('Expiration'),
  };
}
