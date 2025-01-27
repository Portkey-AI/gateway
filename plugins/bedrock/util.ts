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
  body: BedrockBody
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

  return await post<BedrockResponse>(url, body, {
    headers,
    method: 'POST',
  });
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
      result.assessments[0].sensitiveInformationPolicy.piiEntities.forEach(
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
