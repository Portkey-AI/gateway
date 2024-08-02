import {
  getChatCompleteWithMessageContentArraysRequest,
  getChatCompleteWithMessageStringRequest,
} from './resources/requestTemplates';
import transformToProviderRequest from '../services/transformToProviderRequest';
import Providers from '../providers';
import { Context, Hono, HonoRequest } from 'hono';
import app from '../index';
import providersConfig from './resources/providersConfig';
import { CHAT_COMPLETIONS_ENDPOINT } from './resources/constants';
import { createDefaultHeaders } from './resources/utils';

for (const provider in providersConfig) {
  const config = Providers[provider];
  if (config.chatComplete) {
    describe(`${provider} /chat/completions endpoint tests:`, () => {
      let request = new Request(CHAT_COMPLETIONS_ENDPOINT, {
        method: 'POST',
        headers: createDefaultHeaders(
          provider,
          providersConfig[provider].apiKey
        ),
        body: getChatCompleteWithMessageStringRequest(
          providersConfig[provider].chatCompletions.model
        ),
      });

      test(`${provider} /chat/completions test message strings`, async () => {
        const res = await app.fetch(request);
        expect(res.status).toBe(200);
      });

      request = new Request(CHAT_COMPLETIONS_ENDPOINT, {
        method: 'POST',
        headers: createDefaultHeaders(
          provider,
          providersConfig[provider].apiKey
        ),
        body: getChatCompleteWithMessageContentArraysRequest(
          providersConfig[provider].chatCompletions.model
        ),
      });

      test(`${provider} /chat/completions test message content arrays`, async () => {
        const res = await app.fetch(request);
        expect(res.status).toBe(200);
      });
    });
  }
}
