'use server';

import { generateText } from 'ai';
import { createPortkey } from '@portkey-ai/vercel-provider';

export const generateTextAction = async () => {
  const portkey_config = {
    retry: {
      attempts: 3,
    },
    cache: {
      mode: 'simple',
    },
    virtual_key: 'openai-xxx',
    before_request_hooks: [
      {
        id: 'input-guardrail-id-xx',
      },
    ],
    after_request_hooks: [
      {
        id: 'output-guardrail-id-xx',
      },
    ],
  };

  const llmClient = createPortkey({
    apiKey: 'PORTKEY_API_KEY',
    config: portkey_config,
    //Portkey's config allows you to use- loadbalance, fallback, retires, timeouts, semantic caching, conditional routing, guardrails,etc. Head over to portkey docs to learn more
    //we are using API keys inside config, that's why no virtual keys needed
  });

  // Learn more at docs.portkey.ai

  const result = await generateText({
    model: llmClient.completionModel('gpt-3.5-turbo'), //choose model of choice
    prompt: 'tell me a joke',
  });

  return result.text;
};
