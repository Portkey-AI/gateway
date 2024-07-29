import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { BEDROCK_LLAMA_STOP_REASON } from './types';
import { OPEN_AI_CHAT_COMPLETION_FINISH_REASON } from '../types';

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

export const transformBedrockLlamaChatFinishReason = (finishReason: BEDROCK_LLAMA_STOP_REASON | string): OPEN_AI_CHAT_COMPLETION_FINISH_REASON => {
  switch (finishReason) {
    case BEDROCK_LLAMA_STOP_REASON.stop:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
    case BEDROCK_LLAMA_STOP_REASON.length:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
  }
}