import { AnthropicChatCompleteConfig } from '../chatComplete';

jest.mock('../../../data-stores/redis', () => ({
  redisClient: null,
  redisReaderClient: null,
}));

jest.mock('../../../utils/awsAuth', () => ({}));

jest.mock('../../..', () => ({}));

const toolsTransform = (AnthropicChatCompleteConfig.tools as any).transform;

function makeOpenAITool(overrides: Record<string, any> = {}) {
  return {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' },
        },
        required: ['location'],
      },
      ...overrides,
    },
  };
}

describe('Anthropic tool transform - strict parameter', () => {
  it('forwards strict: true to the Anthropic tool definition', () => {
    const result = toolsTransform({
      tools: [makeOpenAITool({ strict: true })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].strict).toBe(true);
  });

  it('forwards strict: false to the Anthropic tool definition', () => {
    const result = toolsTransform({
      tools: [makeOpenAITool({ strict: false })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].strict).toBe(false);
  });

  it('omits strict when not provided in the OpenAI tool', () => {
    const result = toolsTransform({ tools: [makeOpenAITool()] });
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('strict');
  });

  it('handles multiple tools with mixed strict settings', () => {
    const result = toolsTransform({
      tools: [
        makeOpenAITool({ name: 'tool_a', strict: true }),
        makeOpenAITool({ name: 'tool_b', strict: false }),
        makeOpenAITool({ name: 'tool_c' }),
      ],
    });
    expect(result).toHaveLength(3);
    expect(result[0].strict).toBe(true);
    expect(result[1].strict).toBe(false);
    expect(result[2]).not.toHaveProperty('strict');
  });
});
