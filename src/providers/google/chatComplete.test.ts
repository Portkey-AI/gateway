import { ParameterConfig } from '../types';
import { Params } from '../../types/requestBody';
import {
  GoogleChatCompleteConfig,
  GoogleMessage,
  transformOpenAIRoleToGoogleRole,
} from './chatComplete';

const transformContents = (
  GoogleChatCompleteConfig.messages as ParameterConfig[]
).find((entry) => entry.param === 'contents')?.transform as (
  params: Params
) => GoogleMessage[];

describe('transformOpenAIRoleToGoogleRole', () => {
  it('maps OpenAI tool results to user, not the function role Gemini rejects', () => {
    // streamGenerateContent returns HTTP 400 "Role 'function' is not supported."
    // Function responses belong on a user turn with a functionResponse part.
    expect(transformOpenAIRoleToGoogleRole('tool')).not.toBe('function');
    expect(transformOpenAIRoleToGoogleRole('tool')).toBe('user');
  });
});

describe('GoogleChatCompleteConfig contents — two-turn tool flow', () => {
  it('maps assistant tool_calls to model functionCall and tool results to user functionResponse', () => {
    const contents = transformContents({
      model: 'gemini-1.5-pro',
      messages: [
        { role: 'user', content: 'What is the weather in Paris?' },
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call_example',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"city":"Paris"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          name: 'get_weather',
          tool_call_id: 'call_example',
          content: '18C and cloudy',
        },
      ],
    });

    expect(contents).toEqual([
      {
        role: 'user',
        parts: [{ text: 'What is the weather in Paris?' }],
      },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'get_weather',
              args: { city: 'Paris' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'get_weather',
              response: { output: '18C and cloudy' },
            },
          },
        ],
      },
    ]);
  });
});
