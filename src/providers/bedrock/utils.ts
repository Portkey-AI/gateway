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

async function assumeRoleWithWebIdentity(token: string, roleArn: string) {
  const params = new URLSearchParams({
    Version: '2011-06-15',
    Action: 'AssumeRoleWithWebIdentity',
    RoleArn: roleArn,
    RoleSessionName: `eks-${Date.now()}`,
    WebIdentityToken: token,
  });

  const response = await fetch('https://sts.amazonaws.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorMessage = await response.text();
    console.error({ message: `STS error ${errorMessage}` });
    throw new Error(`STS request failed: ${response.status}`);
  }

  const data = await response.text();
  return parseXml(data);
}

async function getAssumedWebIdentityCredentials(
  c: Context,
  awsRoleArn: string,
  awsExternalId: string,
  awsRegion: string
) {
  const getFromCacheByKey = c.get('getFromCacheByKey');
  const putInCacheWithValue = c.get('putInCacheWithValue');

  if (env(c).AWS_WEB_IDENTITY_TOKEN_FILE && env(c).AWS_ROLE_ARN) {
    try {
      const roleArn = awsRoleArn || env(c).AWS_ROLE_ARN;
      const cacheKey = `assumed-web-identity-${env(c).AWS_WEB_IDENTITY_TOKEN_FILE}-role-${roleArn}`;
      const resp = getFromCacheByKey
        ? await getFromCacheByKey(env(c), cacheKey)
        : null;
      if (resp) {
        return resp;
      }
      let token;
      // for node
      if (typeof process !== 'undefined' && process.versions?.node) {
        const fs = await import('fs/promises');
        token = await fs.readFile(env(c).AWS_WEB_IDENTITY_TOKEN_FILE, 'utf8');
      } else {
        // try to fetch it from env
        token = env(c).AWS_WEB_TOKEN;
      }
      if (token) {
        let credentials;
        if (roleArn === env(c).AWS_ROLE_ARN) {
          credentials = await assumeRoleWithWebIdentity(token, roleArn);
        } else {
          const tempCacheKey = `assumed-web-identity-${env(c).AWS_WEB_IDENTITY_TOKEN_FILE}-role-${env(c).AWS_ROLE_ARN}`;
          let tempCredentials = getFromCacheByKey
            ? await getFromCacheByKey(env(c), tempCacheKey)
            : null;
          if (!tempCredentials) {
            tempCredentials = await assumeRoleWithWebIdentity(
              token,
              env(c).AWS_ROLE_ARN
            );
            if (putInCacheWithValue) {
              putInCacheWithValue(env(c), tempCacheKey, tempCredentials, 300); //5 minutes
            }
          }
          credentials = await getSTSAssumedCredentials(
            c,
            roleArn,
            awsExternalId,
            awsRegion,
            tempCredentials.accessKeyId,
            tempCredentials.secretAccessKey,
            tempCredentials.sessionToken
          );
        }
        if (credentials) {
          if (putInCacheWithValue) {
            putInCacheWithValue(env(c), cacheKey, credentials, 300); //5 minutes
          }
          return credentials;
        }
      }
    } catch (error) {
      console.info({ message: error });
    }
  }
  return null;
}

async function getIRSACredentials(
  c: Context,
  awsRoleArn: string,
  awsExternalId: string,
  awsRegion: string
) {
  // if present directly get it
  if (
    (!awsRoleArn || awsRoleArn === env(c).AWS_ROLE_ARN) &&
    env(c).AWS_ACCESS_KEY_ID &&
    env(c).AWS_SECRET_ACCESS_KEY
  ) {
    return {
      accessKeyId: env(c).AWS_ACCESS_KEY_ID,
      secretAccessKey: env(c).AWS_SECRET_ACCESS_KEY,
      sessionToken: env(c).AWS_SESSION_TOKEN,
      expiration: new Date(Date.now() + 3600000),
    };
  }
  // get from web identity
  return getAssumedWebIdentityCredentials(
    c,
    awsRoleArn,
    awsExternalId,
    awsRegion
  );
}

async function getIMDSv2Token() {
  const response = await fetch(`http://169.254.169.254/latest/api/token`, {
    method: 'PUT',
    headers: {
      'X-aws-ec2-metadata-token-ttl-seconds': '21600',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.info({ message: `Failed to get IMDSv2 token: ${error}` });
    throw new Error(error);
  }
  const imdsv2Token = await response.text();
  return imdsv2Token;
}

async function getRoleName(token?: string) {
  const response = await fetch(
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    {
      ...(token && {
        method: 'GET',
        headers: {
          'X-aws-ec2-metadata-token': token,
        },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to get role name: ${response.status}`);
  }
  return response.text();
}

async function getIMDSRoleCredentials(awsRoleArn: string, token?: string) {
  const response = await fetch(
    `http://169.254.169.254/latest/meta-data/iam/security-credentials/${awsRoleArn}`,
    {
      ...(token && {
        method: 'GET',
        headers: {
          'X-aws-ec2-metadata-token': token,
        },
      }),
    }
  );
  if (!response.ok) {
    const error = await response.text();
    console.info({ message: `Failed to get credentials: ${error}` });
    throw new Error(error);
  }

  const credentials: any = await response.json();
  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.Token,
    expiration: credentials.Expiration,
  };
}

async function getIMDSAssumedCredentials(c: Context) {
  const cacheKey = `assumed-imds-credentials`;
  const getFromCacheByKey = c.get('getFromCacheByKey');
  const putInCacheWithValue = c.get('putInCacheWithValue');
  const resp = getFromCacheByKey
    ? await getFromCacheByKey(env(c), cacheKey)
    : null;
  if (resp) {
    return resp;
  }
  let imdsv2Token;
  //use v2 by default
  if (!env(c).AWS_IMDS_V1) {
    // get token
    imdsv2Token = await getIMDSv2Token();
  }
  // get role
  const awsRoleArn = await getRoleName(imdsv2Token);
  // get role credentials
  const credentials: any = await getIMDSRoleCredentials(
    awsRoleArn,
    imdsv2Token
  );
  credentials.awsRoleArn = awsRoleArn;
  if (putInCacheWithValue) {
    putInCacheWithValue(env(c), cacheKey, credentials, 300); //5 minutes
  }
  return credentials;
}

async function getSTSAssumedCredentials(
  c: Context,
  awsRoleArn: string,
  awsExternalId: string,
  awsRegion: string,
  accessKey?: string,
  secretKey?: string,
  sessionToken?: string
) {
  const cacheKey = `assumed-sts-${awsRoleArn}/${awsExternalId}/${awsRegion}`;
  const getFromCacheByKey = c.get('getFromCacheByKey');
  const putInCacheWithValue = c.get('putInCacheWithValue');
  const resp = getFromCacheByKey
    ? await getFromCacheByKey(env(c), cacheKey)
    : null;
  if (resp) {
    return resp;
  }
  // Long-term credentials to assume role, static values from ENV
  const accessKeyId: string =
    accessKey || env(c).AWS_ASSUME_ROLE_ACCESS_KEY_ID || '';
  const secretAccessKey: string =
    secretKey || env(c).AWS_ASSUME_ROLE_SECRET_ACCESS_KEY || '';
  const region = awsRegion || env(c).AWS_ASSUME_ROLE_REGION || 'us-east-1';
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
      putInCacheWithValue(env(c), cacheKey, credentials, 300); //5 minutes
    }
  } catch (error) {
    console.error({ message: `Error assuming role:, ${error}` });
  }
  return credentials;
}

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
  let accessKeyId: string =
    creds?.accessKeyId || env(c).AWS_ASSUME_ROLE_ACCESS_KEY_ID || '';
  let secretAccessKey: string =
    creds?.secretAccessKey || env(c).AWS_ASSUME_ROLE_SECRET_ACCESS_KEY || '';
  let sessionToken;
  // if not passed get from IRSA>WebAssumed>IMDS
  if (!accessKeyId && !secretAccessKey) {
    try {
      const irsaCredentials = await getIRSACredentials(
        c,
        awsRoleArn,
        awsExternalId,
        awsRegion
      );
      if (irsaCredentials) {
        return irsaCredentials;
      }
    } catch (error) {
      console.error(error);
    }

    try {
      const imdsCredentials = await getIMDSAssumedCredentials(c);
      if (!awsRoleArn || imdsCredentials.awsRoleArn === awsRoleArn) {
        return imdsCredentials;
      }
      accessKeyId = imdsCredentials.accessKeyId;
      secretAccessKey = imdsCredentials.secretAccessKey;
      sessionToken = imdsCredentials.sessionToken;
    } catch (error) {
      console.error(error);
    }
  }
  return getSTSAssumedCredentials(
    c,
    awsRoleArn,
    awsExternalId,
    awsRegion,
    accessKeyId,
    secretAccessKey,
    sessionToken
  );
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
