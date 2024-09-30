import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { ContentType, Message, MESSAGE_ROLES } from '../../types/requestBody';
import {
  LLAMA_2_SPECIAL_TOKENS,
  LLAMA_3_SPECIAL_TOKENS,
  MISTRAL_CONTROL_TOKENS,
} from './constants';

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

/*
  Helper function to use inside reduce to convert ContentType array to string
*/
const convertContentTypesToString = (acc: string, curr: ContentType) => {
  if (curr.type !== 'text') return acc;
  acc += curr.text + '\n';
  return acc;
};

/*
  Handle messages of both string and ContentType array
*/
const getMessageContent = (message: Message) => {
  if (message === undefined) return '';
  if (typeof message.content === 'object') {
    return message.content.reduce(convertContentTypesToString, '');
  }
  return message.content || '';
};

/*
  This function transforms the messages for the LLama 3.1 prompt.
  It adds the special tokens to the beginning and end of the prompt.
  refer: https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_1
  NOTE: Portkey does not restrict messages to alternate user and assistant roles, this is to support more flexible use cases.
*/
export const transformMessagesForLLama3Prompt = (messages: Message[]) => {
  let prompt: string = '';
  prompt += LLAMA_3_SPECIAL_TOKENS.PROMPT_START + '\n';
  messages.forEach((msg, index) => {
    prompt +=
      LLAMA_3_SPECIAL_TOKENS.ROLE_START +
      msg.role +
      LLAMA_3_SPECIAL_TOKENS.ROLE_END +
      '\n';
    prompt += getMessageContent(msg) + LLAMA_3_SPECIAL_TOKENS.END_OF_TURN;
  });
  prompt +=
    LLAMA_3_SPECIAL_TOKENS.ROLE_START +
    MESSAGE_ROLES.ASSISTANT +
    LLAMA_3_SPECIAL_TOKENS.ROLE_END +
    '\n';
  return prompt;
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
      getMessageContent(messages[0]) +
      LLAMA_2_SPECIAL_TOKENS.SYSTEM_MESSAGE_END +
      getMessageContent(messages[1]);
  }
  messages = [messages[0], ...messages.slice(2)];
  // attach message pairs
  for (let i = 1; i < messages.length; i += 2) {
    let prompt = getMessageContent(messages[i - 1]);
    let answer = getMessageContent(messages[i]);
    finalPrompt += `${LLAMA_2_SPECIAL_TOKENS.BEGINNING_OF_SENTENCE}${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_START} ${prompt} ${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_END} ${answer} ${LLAMA_2_SPECIAL_TOKENS.END_OF_SENTENCE}`;
  }
  if (messages.length % 2 === 1) {
    finalPrompt += `${LLAMA_2_SPECIAL_TOKENS.BEGINNING_OF_SENTENCE}${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_START} ${getMessageContent(messages[messages.length - 1])} ${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_END}`;
  }
  return finalPrompt;
};

/*
refer: https://docs.mistral.ai/guides/tokenization/
refer: https://github.com/chujiezheng/chat_templates/blob/main/chat_templates/mistral-instruct.jinja
*/
export const transformMessagesForMistralPrompt = (messages: Message[]) => {
  let finalPrompt: string = `${MISTRAL_CONTROL_TOKENS.BEGINNING_OF_SENTENCE}`;
  // Mistral does not support system messages. (ref: https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3/discussions/14)
  if (messages.length > 0 && messages[0].role === MESSAGE_ROLES.SYSTEM) {
    messages[0].content =
      getMessageContent(messages[0]) + '\n' + getMessageContent(messages[1]);
    messages[0].role = MESSAGE_ROLES.USER;
  }
  for (const message of messages) {
    if (message.role === MESSAGE_ROLES.USER) {
      finalPrompt += `${MISTRAL_CONTROL_TOKENS.CONVERSATION_TURN_START} ${message.content} ${MISTRAL_CONTROL_TOKENS.CONVERSATION_TURN_END}`;
    } else {
      finalPrompt += ` ${message.content} ${MISTRAL_CONTROL_TOKENS.END_OF_SENTENCE}`;
    }
  }
  return finalPrompt;
};
