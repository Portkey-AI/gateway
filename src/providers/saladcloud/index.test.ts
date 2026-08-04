import { SALADCLOUD } from '../../globals';
import SaladCloudAPIConfig from './api';
import {
  SaladCloudChatCompleteDefaults,
  SaladCloudChatCompleteExcludedParams,
  SaladCloudChatCompleteExtraParams,
} from './chatComplete';

describe('SaladCloud provider', () => {
  const providerOptions = { provider: SALADCLOUD, apiKey: 'test-key' };

  it('uses the SaladCloud OpenAI-compatible chat completions endpoint', () => {
    const baseURLArgs = {
      providerOptions,
    } as Parameters<typeof SaladCloudAPIConfig.getBaseURL>[0];
    const endpointArgs = {
      fn: 'chatComplete',
      providerOptions,
    } as Parameters<typeof SaladCloudAPIConfig.getEndpoint>[0];
    const headerArgs = {
      providerOptions,
    } as Parameters<typeof SaladCloudAPIConfig.headers>[0];

    expect(SaladCloudAPIConfig.getBaseURL(baseURLArgs)).toEqual(
      'https://ai.salad.cloud/v1'
    );
    expect(SaladCloudAPIConfig.getEndpoint(endpointArgs)).toEqual(
      '/chat/completions'
    );
    expect(SaladCloudAPIConfig.headers(headerArgs)).toEqual({
      Authorization: 'Bearer test-key',
    });
  });

  it('defaults to the 35B model without disabling reasoning', () => {
    expect(SaladCloudChatCompleteDefaults).toEqual({
      model: 'qwen3.6-35b-a3b',
    });
    expect(SaladCloudChatCompleteExcludedParams).not.toContain(
      'reasoning_effort'
    );
    expect(SaladCloudChatCompleteExtraParams.chat_template_kwargs).toEqual({
      param: 'chat_template_kwargs',
    });
  });
});
