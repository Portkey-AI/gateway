import { getChatCompleteWithMessageContentArraysRequest } from './resources/requestTemplates';
import transformToProviderRequest from '../services/transformToProviderRequest';
import Providers from '../providers';
import { Context, Hono, HonoRequest } from 'hono';
import app from '../index';
import providersConfig from './resources/providersConfig';
import { CHAT_COMPLETIONS_ENDPOINT } from './resources/constants';
import { createDefaultHeaders } from './resources/utils';

for (const provider in providersConfig) {
  const config = Providers[provider]
  if (config.chatComplete) {
    describe(`${provider} /chat/completions endpoint tests:`, () => {
      const r = new Request(CHAT_COMPLETIONS_ENDPOINT, {
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
        const res = await app.fetch(r);
        expect(res.status).toBe(200);
      });

      // test(`${provider} /chat/completions test request transformer only with message content arrays`, () => {
      //     if (config.chatComplete) {
      //     expect(transformToProviderRequest(provider, CHAT_COMPLETE_WITH_MESSAGE_CONTENT_ARRAYS_REQUEST, 'chatComplete')).toBeDefined();
      // }
      // });

      // // test(`${provider} /chat/completions test provider request with message content arrays`, () => {

      // // }
      // // );

      // test(`${provider} /chat/completions test request transformer with string messages`, () => {
      //     if (config.chatComplete) {
      //     expect(transformToProviderRequest(provider, CHAT_COMPLETE_WITH_MESSAGE_STRING_REQUEST, 'chatComplete')).toBeDefined();
      // }
      // });
    });
  }
}

// You can now use this `anthropicRequest` object in your tests or app.fetch() calls
// ... existing code ...// const rt = new Request('https://www.google.com/search?q=linux', { method: 'GET'});
// const res = app.fetch(r);
// if (res instanceof Promise) {
//   res.then((r) => {
//     console.log(r);
//   });
// } else {
//   // Handle the non-promise case
// }
// console.log(res);
// const hr = new HonoRequest(r);
// console.log(hr);
// const hr = new HonoRequest(r);

//     test(`${provider} test`, () => {
//         // SIMPLE_REQUEST_PARAMS
//     // transformToProviderRequest
//     console.log(transformToProviderRequest('anthropic', CHAT_COMPLETE_WITH_MESSAGE_CONTENT_ARRAYS_REQUEST, 'chatComplete'))
//     expect(transformToProviderRequest('anthropic', CHAT_COMPLETE_WITH_MESSAGE_CONTENT_ARRAYS_REQUEST, 'chatComplete')).toBeDefined();
// });
