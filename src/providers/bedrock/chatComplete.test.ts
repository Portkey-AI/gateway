jest.mock('../../utils/env', () => ({ Environment: () => ({}) }));

import { BedrockConverseChatCompleteConfig } from './chatComplete';

const transformMessages = (messages: any[]) => {
  const messagesConfig = BedrockConverseChatCompleteConfig.messages;
  const transform = Array.isArray(messagesConfig)
    ? messagesConfig[0].transform
    : messagesConfig.transform;
  return transform!(
    { model: 'anthropic.claude-test', messages },
    {
      provider: 'bedrock',
    }
  );
};

describe('Bedrock Converse chat completion request', () => {
  it('keeps tool calls paired with their tool results and removes empty messages', () => {
    const messages = transformMessages([
      { role: 'user', content: 'What is the weather?' },
      { role: 'assistant', content: '' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_weather',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Pune"}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_weather',
        content: '{"temperature":29}',
      },
    ]);

    expect(messages).toEqual([
      { role: 'user', content: [{ text: 'What is the weather?' }] },
      {
        role: 'assistant',
        content: [
          {
            toolUse: {
              name: 'get_weather',
              input: { city: 'Pune' },
              toolUseId: 'call_weather',
            },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            toolResult: {
              content: [{ text: '{"temperature":29}' }],
              toolUseId: 'call_weather',
            },
          },
        ],
      },
    ]);
  });

  it('converts file data URLs to Bedrock document bytes', () => {
    const messages = transformMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: {
              file_data: 'data:application/pdf;base64,JVBERi0xLjQ=',
              file_name: 'report.pdf',
            },
          },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          {
            document: {
              format: 'pdf',
              name: 'report_pdf',
              source: { bytes: 'JVBERi0xLjQ=' },
            },
          },
        ],
      },
    ]);
  });
});
