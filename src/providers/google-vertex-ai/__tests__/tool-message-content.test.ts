// Tool message content (OpenAI format) → Vertex Gemini functionResponse
jest.mock('../../../data-stores/redis', () => ({
  redisClient: null,
  redisReaderClient: null,
}));

jest.mock('../../../utils/awsAuth', () => ({}));

jest.mock('../../..', () => ({}));

import { VertexGoogleChatCompleteConfig } from '../chatComplete';
import { transformUsingProviderConfig } from '../../../services/transformToProviderRequest';
import { Params } from '../../../types/requestBody';

describe('Google Vertex AI tool message content (OpenAI format)', () => {
  it('should transform tool message with string content to one functionResponse part', () => {
    const params = {
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          tool_calls: [
            {
              id: '1',
              type: 'function',
              function: { name: 'get_time', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', name: 'get_time', content: 'The time is 10PM' },
      ],
      tools: [
        { type: 'function', function: { name: 'get_time', parameters: {} } },
      ],
    } as Params;

    const transformed = transformUsingProviderConfig(
      VertexGoogleChatCompleteConfig,
      params
    );
    const toolContent = transformed.contents.find(
      (c: any) =>
        c.role === 'function' && c.parts?.some((p: any) => p.functionResponse)
    );

    expect(toolContent).toBeDefined();
    expect(toolContent.parts).toHaveLength(1);
    expect(toolContent.parts[0].functionResponse).toEqual({
      name: 'get_time',
      response: { content: 'The time is 10PM' },
    });
  });

  it('should transform tool message with array of text parts to one functionResponse per text part', () => {
    const params = {
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          tool_calls: [
            {
              id: '1',
              type: 'function',
              function: { name: 'get_time', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          name: 'get_time',
          content: [
            { type: 'text', text: 'Part one' },
            { type: 'text', text: 'Part two' },
          ],
        },
      ],
      tools: [
        { type: 'function', function: { name: 'get_time', parameters: {} } },
      ],
    } as Params;

    const transformed = transformUsingProviderConfig(
      VertexGoogleChatCompleteConfig,
      params
    );
    const toolContent = transformed.contents.find(
      (c: any) =>
        c.role === 'function' && c.parts?.some((p: any) => p.functionResponse)
    );

    expect(toolContent).toBeDefined();
    expect(toolContent.parts).toHaveLength(2);
    expect(toolContent.parts[0].functionResponse).toEqual({
      name: 'get_time',
      response: { content: 'Part one' },
    });
    expect(toolContent.parts[1].functionResponse).toEqual({
      name: 'get_time',
      response: { content: 'Part two' },
    });
  });

  it('should only include text parts when tool message content is array (OpenAI: text only)', () => {
    const params = {
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'Hi' },
        {
          role: 'assistant',
          tool_calls: [
            {
              id: '1',
              type: 'function',
              function: { name: 'fn', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          name: 'fn',
          content: [
            { type: 'text', text: 'Only this text' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/img.png' },
            },
          ],
        },
      ],
      tools: [{ type: 'function', function: { name: 'fn', parameters: {} } }],
    } as Params;

    const transformed = transformUsingProviderConfig(
      VertexGoogleChatCompleteConfig,
      params
    );
    const toolContent = transformed.contents.find(
      (c: any) =>
        c.role === 'function' && c.parts?.some((p: any) => p.functionResponse)
    );

    expect(toolContent).toBeDefined();
    const functionResponseParts = toolContent.parts.filter(
      (p: any) => p.functionResponse
    );
    expect(functionResponseParts.length).toBeGreaterThanOrEqual(1);
    expect(functionResponseParts[0].functionResponse.response.content).toBe(
      'Only this text'
    );
  });
});
