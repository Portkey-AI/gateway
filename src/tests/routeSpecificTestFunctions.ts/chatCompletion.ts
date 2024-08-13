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
  if (!providerVariables.chatCompletions) {
    console.warn(
      `Skipping ${providerName} as it does not have chat completions options`
    );
    return;
  }

  test(`${providerName} /chat/completions test message strings`, async () => {
    const request = new Request(CHAT_COMPLETIONS_ENDPOINT, {
      method: 'POST',
      headers: createDefaultHeaders(providerName, providerVariables.apiKey),
      body: getChatCompleteWithMessageStringRequest(
        providerVariables.chatCompletions?.model
      ),
    });
    const res = await app.fetch(request);
    expect(res.status).toBe(200);
  });

  test(`${providerName} /chat/completions test message content arrays`, async () => {
    const request = new Request(CHAT_COMPLETIONS_ENDPOINT, {
      method: 'POST',
      headers: createDefaultHeaders(providerName, providerVariables.apiKey),
      body: getChatCompleteWithMessageContentArraysRequest(
        providerVariables.chatCompletions?.model
      ),
    });
    const res = await app.fetch(request);
    expect(res.status).toBe(200);
  });
};
