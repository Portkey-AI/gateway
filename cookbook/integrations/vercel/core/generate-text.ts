import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await generateText({
    model: openai('gpt-4o'),
    prompt: 'Tell me a joke.',
  });

  console.log(result.text);
}

main().catch(console.error);
