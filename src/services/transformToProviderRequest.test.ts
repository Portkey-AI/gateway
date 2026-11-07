/**
 * Load the transformer without compiling the full provider barrel.
 * ts-jest rewrites the project to CommonJS, which cannot compile top-level await
 * pulled in by src/providers/index.ts.
 */
jest.mock('../providers', () => {
  const { OpenAIChatCompleteConfig } = jest.requireActual(
    '../providers/openai/chatComplete'
  );
  return {
    __esModule: true,
    default: {
      openai: {
        api: {},
        chatComplete: OpenAIChatCompleteConfig,
      },
      dashscope: {
        api: {},
        chatComplete: {
          model: { param: 'model', required: true },
          messages: { param: 'messages' },
          enable_thinking: { param: 'enable_thinking' },
        },
      },
    },
  };
});

import { OPEN_AI } from '../globals';
import { ProviderConfig } from '../providers/types';
import { Params } from '../types/requestBody';
import {
  appendForwardedParams,
  transformToProviderRequest,
} from './transformToProviderRequest';

const chatParams = {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'hi' }],
  enable_thinking: true,
  providerOptions: { qwen: { enable_thinking: true } },
} as Params;

describe('appendForwardedParams', () => {
  const providerConfig: ProviderConfig = {
    model: { param: 'model' },
    top_k: { param: 'topK' },
  };

  const params = {
    model: 'm',
    top_k: 10,
    enable_thinking: false,
    custom_score: 0,
    providerOptions: { vendor: { flag: true } },
  } as Params;

  const mapped = { model: 'm', topK: 10 };

  it('leaves the mapped body unchanged when forwardParams is omitted', () => {
    const result = appendForwardedParams(
      { ...mapped },
      params,
      providerConfig,
      { provider: OPEN_AI }
    );

    expect(result).toEqual(mapped);
  });

  it('copies only the named fields, including false and zero', () => {
    const result = appendForwardedParams(
      { ...mapped },
      params,
      providerConfig,
      {
        provider: OPEN_AI,
        forwardParams: ['enable_thinking', 'custom_score', 'providerOptions'],
      }
    );

    expect(result).toEqual({
      ...mapped,
      enable_thinking: false,
      custom_score: 0,
      providerOptions: { vendor: { flag: true } },
    });
  });

  it('forwards unmapped fields for * and keeps renamed provider fields', () => {
    const result = appendForwardedParams(
      { ...mapped },
      params,
      providerConfig,
      { provider: OPEN_AI, forwardParams: ['*'] }
    );

    expect(result).toEqual({
      ...mapped,
      enable_thinking: false,
      custom_score: 0,
      providerOptions: { vendor: { flag: true } },
    });
    expect(result).not.toHaveProperty('top_k');
    expect(result.model).toBe('m');
  });

  it('does not overwrite a key the provider config already emitted', () => {
    const result = appendForwardedParams(
      { model: 'mapped-model' },
      { model: 'raw-model', extra: 1 } as Params,
      { model: { param: 'model' } },
      { provider: OPEN_AI, forwardParams: ['model', 'extra'] }
    );

    expect(result).toEqual({ model: 'mapped-model', extra: 1 });
  });

  it('ignores prototype-polluting keys', () => {
    const result = appendForwardedParams(
      {},
      { ['__proto__']: { polluted: true }, enable_thinking: true } as Params,
      {},
      { provider: OPEN_AI, forwardParams: ['*'] }
    );

    expect(result).toEqual({ enable_thinking: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('transformToProviderRequest chat body', () => {
  it('drops non-standard fields on the OpenAI path by default', () => {
    const result = transformToProviderRequest(
      OPEN_AI,
      chatParams,
      chatParams,
      'chatComplete',
      {},
      { provider: OPEN_AI }
    ) as Record<string, unknown>;

    expect(result.model).toBe('gpt-4o');
    expect(result.messages).toEqual(chatParams.messages);
    expect(result).not.toHaveProperty('enable_thinking');
    expect(result).not.toHaveProperty('providerOptions');
  });

  it('forwards named custom fields for a custom OpenAI-compatible provider', () => {
    const result = transformToProviderRequest(
      OPEN_AI,
      chatParams,
      chatParams,
      'chatComplete',
      {},
      {
        provider: OPEN_AI,
        forwardParams: ['enable_thinking', 'providerOptions'],
      }
    ) as Record<string, unknown>;

    expect(result.model).toBe('gpt-4o');
    expect(result.messages).toEqual(chatParams.messages);
    expect(result.enable_thinking).toBe(true);
    expect(result.providerOptions).toEqual({
      qwen: { enable_thinking: true },
    });
  });

  it('still maps provider-native fields without forwardParams', () => {
    const params = {
      model: 'qwen-turbo',
      messages: [{ role: 'user', content: 'hi' }],
      enable_thinking: true,
    } as Params;

    const result = transformToProviderRequest(
      'dashscope',
      params,
      params,
      'chatComplete',
      {},
      { provider: 'dashscope' }
    ) as Record<string, unknown>;

    expect(result.enable_thinking).toBe(true);
    expect(result.model).toBe('qwen-turbo');
  });
});
