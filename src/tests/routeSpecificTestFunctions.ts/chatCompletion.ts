import app from '../..';
import { CHAT_COMPLETIONS_ENDPOINT } from '../resources/constants';
import {
  getChatCompleteWithMessageContentArraysRequest,
  getChatCompleteWithMessageStringRequest,
} from '../resources/requestTemplates';
import { TestVariable } from '../resources/testVariables';
import { createDefaultHeaders } from '../resources/utils';

export const executeChatCompletionEndpointTests: (
  providerName: string,
  providerVariables: TestVariable
) => void = (providerName, providerVariables) => {
  const model = providerVariables.chatCompletions?.model;
  const apiKey = providerVariables.apiKey;
  if (!model || !apiKey) {
    console.warn(
      `Skipping ${providerName} as it does not have chat completions options`
    );
    return;
  }

  test(`${providerName} /chat/completions test message strings`, async () => {
    const res = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
      method: 'POST',
      headers: createDefaultHeaders(providerName, apiKey),
      body: getChatCompleteWithMessageStringRequest(model),
    });
    expect(res.status).toEqual(200);
  });

  test(`${providerName} /chat/completions test message content arrays`, async () => {
    const res = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
      method: 'POST',
      headers: createDefaultHeaders(providerName, apiKey),
      body: getChatCompleteWithMessageContentArraysRequest(model),
    });
    expect(res.status).toEqual(200);
  });
};
