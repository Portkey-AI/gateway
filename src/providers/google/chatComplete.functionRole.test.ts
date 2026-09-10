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

describe('transformOpenAIRoleToGoogleRole — legacy function role', () => {
  it("maps 'function' to 'user' because Gemini rejects role 'function'", () => {
    // generateContent/streamGenerateContent accept only user/model (/system):
    // "Role 'function' is not supported. Please use a valid role: MODEL, USER."
    expect(transformOpenAIRoleToGoogleRole('function')).toBe('user');
  });
});

describe('GoogleChatCompleteConfig contents — legacy function-call flow', () => {
  it('sends legacy function messages as user functionResponse parts', () => {
    const contents = transformContents({
      model: 'gemini-1.5-pro',
      messages: [
        { role: 'user', content: 'What is the weather in Taipei?' },
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"city":"Taipei"}',
              },
            },
          ],
        },
        {
          role: 'function',
          name: 'get_weather',
          content: '{"temp":25}',
        },
      ],
    });

    expect(contents[2]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'get_weather',
            response: { output: '{"temp":25}' },
          },
        },
      ],
    });
  });
});
