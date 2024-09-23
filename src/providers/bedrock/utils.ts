import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { Message, MESSAGE_ROLES } from '../../types/requestBody';

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

const LLAMA_3_SPECIAL_TOKENS = {
  PROMPT_START: '<|begin_of_text|>',
  PROMPT_END: '<|end_of_text|>',
  PADDING: '<|finetune_right_pad_id|>',
  ROLE_START: '<|start_header_id|>',
  ROLE_END: '<|end_header_id|>',
  END_OF_MESSAGE: '<|eom_id|>',
  END_OF_TURN: '<|eot_id|>',
  TOOL_CALL: '<|python_tag|>',
};

export const transformMessagesForLLamaPrompt = (messages: Message[]) => {
  let prompt: string = '';
  prompt += LLAMA_3_SPECIAL_TOKENS.PROMPT_START + '\n';
  messages.forEach((msg, index) => {
    prompt +=
      LLAMA_3_SPECIAL_TOKENS.ROLE_START +
      msg.role +
      LLAMA_3_SPECIAL_TOKENS.ROLE_END +
      '\n';
    prompt += msg.content + LLAMA_3_SPECIAL_TOKENS.END_OF_TURN;
  });
  prompt +=
    LLAMA_3_SPECIAL_TOKENS.ROLE_START +
    MESSAGE_ROLES.ASSISTANT +
    LLAMA_3_SPECIAL_TOKENS.ROLE_END +
    '\n';
  return prompt;
};
