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

export const transformMessagesForLLama3Prompt = (messages: Message[]) => {
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

const LLAMA_2_SPECIAL_TOKENS = {
  BEGINNING_OF_SENTENCE: '<s>',
  END_OF_SENTENCE: '</s>',
  CONVERSATION_TURN_START: '[INST]',
  CONVERSATION_TURN_END: '[/INST]',
  SYSTEM_MESSAGE_START: '<<SYS>>\n',
  SYSTEM_MESSAGE_END: '\n<</SYS>>\n\n',
};

/*
  This function transforms the messages for the LLama 2 prompt.
  It combines the system message with the first user message,
  and then attaches the message pairs.
  Finally, it adds the last message to the prompt.
  refer: https://github.com/meta-llama/llama/blob/main/llama/generation.py#L284-L395
*/
export const transformMessagesForLLama2Prompt = (messages: Message[]) => {
  let finalPrompt: string = '';
  // combine system message with first user message
  if (messages.length > 0 && messages[0].role === MESSAGE_ROLES.SYSTEM) {
    messages[0].content =
      LLAMA_2_SPECIAL_TOKENS.SYSTEM_MESSAGE_START +
      messages[0].content +
      LLAMA_2_SPECIAL_TOKENS.SYSTEM_MESSAGE_END +
      messages[1].content;
  }
  messages = [messages[0], ...messages.slice(2)];
  // attach message pairs
  for (let i = 1; i < messages.length; i += 2) {
    let prompt = messages[i - 1].content;
    let answer = messages[i].content;
    finalPrompt += `${LLAMA_2_SPECIAL_TOKENS.BEGINNING_OF_SENTENCE}${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_START} ${prompt} ${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_END} ${answer} ${LLAMA_2_SPECIAL_TOKENS.END_OF_SENTENCE}`;
  }
  finalPrompt += `${LLAMA_2_SPECIAL_TOKENS.BEGINNING_OF_SENTENCE}${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_START} ${messages[messages.length - 1].content} ${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_END}`;
  return finalPrompt;
};
