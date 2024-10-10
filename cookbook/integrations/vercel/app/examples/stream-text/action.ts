'use server';

import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createStreamableValue } from 'ai/rsc';
import { createPortkey } from '@portkey-ai/vercel-provider';

export const streamTextAction = async () => {
  const llmClient = createPortkey({
    apiKey: 'PORTKEY_API_KEY',
    virtualKey: 'YOUR_OPENAI_VIRTUAL_KEY',
  });

  const result = await streamText({
    model: llmClient.completionModel('gpt-3.5-turbo-instruct'),
    temperature: 0.5,
    prompt: 'Tell me a joke.',
  });
  return createStreamableValue(result.textStream).value;
};
