import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@smithy/signature-v4';
import { BedrockBody, BedrockResponse, PIIFilter } from './type';
import { post } from '../utils';

export const generateAWSHeaders = async (
  body: Record<string, any>,
  headers: Record<string, string>,
  url: string,
  method: string,
  awsService: string,
  region: string,
  awsAccessKeyID: string,
  awsSecretAccessKey: string,
  awsSessionToken: string | undefined
): Promise<Record<string, string>> => {
  const signer = new SignatureV4({
    service: awsService,
    region: region || 'us-east-1',
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
  let requestBody;
  if (method !== 'GET' && body) {
    requestBody = JSON.stringify(body);
  }
  const queryParams = Object.fromEntries(urlObj.searchParams.entries());
  const request = {
    method: method,
    path: urlObj.pathname,
    query: queryParams,
    protocol: 'https',
    hostname: urlObj.hostname,
    headers: headers,
    ...(requestBody && { body: requestBody }),
  };

  const signed = await signer.sign(request);
  return signed.headers;
};

export const bedrockPost = async (
  credentials: Record<string, string>,
  body: BedrockBody,
  timeout?: number
) => {
  const url = `https://bedrock-runtime.${credentials?.awsRegion}.amazonaws.com/guardrail/${credentials?.guardrailId}/version/${credentials?.guardrailVersion}/apply`;

  const headers = await generateAWSHeaders(
    body,
    {
      'Content-Type': 'application/json',
    },
    url,
    'POST',
    'bedrock',
    credentials?.awsRegion ?? 'us-east-1',
    credentials?.awsAccessKeyId!,
    credentials?.awsSecretAccessKey!,
    credentials?.awsSessionToken || ''
  );

  return await post<BedrockResponse>(
    url,
    body,
    {
      headers,
      method: 'POST',
    },
    timeout
  );
};

const replaceMatches = (
  filter: PIIFilter & { name?: string },
  text: string,
  isRegex?: boolean
) => {
  // `filter.type` will be for PII, else use name to `mask` text.
  return text.replaceAll(
    filter.match,
    `{${isRegex ? filter.name : filter.type}}`
  );
};

/**
 * @description Redacts PII information for the text passed by invoking the bedrock endpoint.
 * @param text
 * @param eventType
 * @param credentials
 * @returns
 */
export const redactPii = (text: string, result: BedrockResponse | null) => {
  try {
    if (!result) return null;
    if (!result.assessments[0]?.sensitiveInformationPolicy || !text) {
      return null;
    }
    // `ANONYMIZED` means text is already masked by api invokation
    const isMasked =
      result.assessments[0].sensitiveInformationPolicy.piiEntities?.find(
        (entity) => entity.action === 'ANONYMIZED'
      );

    let maskedText: string = text;
    if (isMasked) {
      // Use the invoked text directly.
      const data = result.output?.[0];

      maskedText = data?.text;
    } else {
      // Replace the all entires of each filter sent from api.
      result.assessments[0].sensitiveInformationPolicy.piiEntities?.forEach(
        (filter) => {
          maskedText = replaceMatches(filter, maskedText, false);
        }
      );
    }

    // Replace the all entires of each filter sent from api for regex
    const isRegexMatch =
      result.assessments[0].sensitiveInformationPolicy?.regexes?.length > 0;
    if (isRegexMatch) {
      result.assessments[0].sensitiveInformationPolicy.regexes.forEach(
        (regex) => {
          maskedText = replaceMatches(regex as any, maskedText, true);
        }
      );
    }
    return maskedText;
  } catch (e) {
    return null;
  }
};

export async function getAssumedRoleCredentials(
  getFromCacheByKey: Function | undefined,
  putInCacheWithValue: Function | undefined,
  env: Record<string, any>,
  awsRoleArn: string,
  awsExternalId: string,
  awsRegion: string,
  creds?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }
) {
  if (!awsRoleArn) {
    return;
  }
  const cacheKey = `${awsRoleArn}/${awsExternalId}/${awsRegion}`;
  const resp = getFromCacheByKey
    ? await getFromCacheByKey(env, cacheKey)
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
      env;
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
      putInCacheWithValue(env, cacheKey, credentials, 60); //1 minute
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
