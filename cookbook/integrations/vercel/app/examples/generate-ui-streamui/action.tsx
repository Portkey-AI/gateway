'use server';

import { createAI, getMutableAIState, streamUI } from 'ai/rsc';
import { openai } from '@ai-sdk/openai';
import { ReactNode } from 'react';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { JokeComponent } from './joke-component';
import { generateObject } from 'ai';
import { jokeSchema } from './joke';

export interface ServerMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClientMessage {
  id: string;
  role: 'user' | 'assistant';
  display: ReactNode;
}

export async function continueConversation(
  input: string
): Promise<ClientMessage> {
  'use server';

  const history = getMutableAIState();

  const result = await streamUI({
    model: openai('gpt-4o'),
    messages: [...history.get(), { role: 'user', content: input }],
    text: ({ content, done }) => {
      if (done) {
        history.done((messages: ServerMessage[]) => [
          ...messages,
          { role: 'assistant', content },
        ]);
      }

      return <div>{content}</div>;
    },
    tools: {
      tellAJoke: {
        description: 'Tell a joke',
        parameters: z.object({
          location: z.string().describe('the users location'),
        }),
        generate: async function* ({ location }) {
          yield <div>loading...</div>;
          const joke = await generateObject({
            model: openai('gpt-4o'),
            schema: jokeSchema,
            prompt:
              'Generate a joke that incorporates the following location:' +
              location,
          });
          return <JokeComponent joke={joke.object} />;
        },
      },
    },
  });

  return {
    id: nanoid(),
    role: 'assistant',
    display: result.value,
  };
}

export const AI = createAI<ServerMessage[], ClientMessage[]>({
  actions: {
    continueConversation,
  },
  initialAIState: [],
  initialUIState: [],
});
