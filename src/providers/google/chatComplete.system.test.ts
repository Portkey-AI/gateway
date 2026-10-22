import { GoogleChatCompleteConfig } from './chatComplete';

const contentsTransform = (GoogleChatCompleteConfig.messages as any[])[0]
  .transform;
const systemInstructionTransform = (GoogleChatCompleteConfig.messages as any[])[1]
  .transform;

describe('GoogleChatCompleteConfig system + tool_calls text (#1838)', () => {
  it('includes mid-conversation system messages in systemInstruction', () => {
    const params = {
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'This is a mid-turn system message' },
        { role: 'user', content: 'hello' },
      ],
    };

    const contents = contentsTransform(params);
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'hi' }, { text: 'hello' }] },
    ]);

    const systemInstruction = systemInstructionTransform(params);
    expect(systemInstruction).toEqual({
      role: 'system',
      parts: [{ text: 'This is a mid-turn system message' }],
    });
  });

  it('collects multiple system messages into systemInstruction', () => {
    const params = {
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'Also be brief.' },
      ],
    };

    const systemInstruction = systemInstructionTransform(params);
    expect(systemInstruction).toEqual({
      role: 'system',
      parts: [{ text: 'You are helpful.' }, { text: 'Also be brief.' }],
    });

    const contents = contentsTransform(params);
    expect(contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
  });

  it('keeps assistant text alongside tool_calls', () => {
    const params = {
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: 'Thinking...',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'foo', arguments: '{}' },
            },
          ],
        },
      ],
    };

    const contents = contentsTransform(params);
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      {
        role: 'model',
        parts: [
          { text: 'Thinking...' },
          { functionCall: { name: 'foo', args: {} } },
        ],
      },
    ]);
  });
});
