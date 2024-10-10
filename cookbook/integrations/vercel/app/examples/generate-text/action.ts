'use server';

import { generateText } from 'ai';
import { createPortkey } from '@portkey-ai/vercel-provider';

export const generateTextAction = async () => {
  const llmClient = createPortkey({
    apiKey: 'PORTKEY_API_KEY',
    virtualKey: 'YOUR_OPENAI_VIRTUAL_KEY', //head over to https://app.portkey.ai to create Virtual key

    //Portkey's config allows you to use- loadbalance, fallback, retires, timeouts, semantic caching, conditional routing, guardrails,etc. Head over to portkey docs to learn more
  });

  // Learn more at docs.portkey.ai

  const result = await generateText({
    model: llmClient.completionModel('gpt-3.5-turbo'), //choose model of choice
    prompt: 'tell me a joke',
  });

  return result.text;
};
