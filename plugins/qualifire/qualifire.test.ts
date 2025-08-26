import { convertToMessages, parseAvailableTools } from './globals';
import { HookEventType } from '../types';

// Global mock credentials for all tests
const mockParameters = {
  credentials: {
    apiKey: 'test-api-key',
  },
};

// Global mock responses for all tests
const mockSuccessfulEvaluation = {
  error: null,
  verdict: true,
  data: { score: 0.95 },
};

const mockFailedEvaluation = {
  error: null,
  verdict: false,
  data: { score: 0.3 },
};

function getParameters() {
  return {
    credentials: {
      apiKey: process.env.QUALIFIRE_API_KEY || '',
    },
  };
}

describe('qualifire globals convertToMessages', () => {
  const mockRequest = {
    json: {
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ],
    },
  };

  const mockResponse = {
    json: {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'I am doing well, thank you for asking!',
          },
        },
      ],
    },
  };

  const mockResponseWithToolCalls = {
    json: {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'I will help you with that',
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location": "New York"}',
                },
              },
            ],
          },
        },
      ],
    },
  };

  describe('Case 1: only request passed and ignoreRequestHistory is true', () => {
    it('should return only the last message when ignoreRequestHistory is true', () => {
      const result = convertToMessages(mockRequest, undefined, true);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: 'How are you?',
        tool_calls: undefined,
        tool_call_id: undefined,
      });
    });
  });

  describe('Case 2: request and response passed and ignoreRequestHistory is true', () => {
    it('should return last request message and response message when ignoreRequestHistory is true', () => {
      const result = convertToMessages(mockRequest, mockResponse, true);

      expect(result).toHaveLength(2);

      // First message should be the last request message
      expect(result[0]).toEqual({
        role: 'user',
        content: 'How are you?',
        tool_calls: undefined,
        tool_call_id: undefined,
      });

      // Second message should be the response message
      expect(result[1]).toEqual({
        role: 'assistant',
        content: 'I am doing well, thank you for asking!',
        tool_calls: undefined,
      });
    });

    it('should handle response with tool calls correctly', () => {
      const result = convertToMessages(
        mockRequest,
        mockResponseWithToolCalls,
        true
      );

      expect(result).toHaveLength(2);
      expect(result[1].tool_calls).toEqual([
        {
          id: 'call_123',
          name: 'get_weather',
          arguments: { location: 'New York' },
        },
      ]);
    });
  });

  describe('Case 3: only request passed and ignoreRequestHistory is false', () => {
    it('should return all request messages when ignoreRequestHistory is false', () => {
      const result = convertToMessages(mockRequest, undefined, false);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant',
        tool_calls: undefined,
        tool_call_id: undefined,
      });
      expect(result[1]).toEqual({
        role: 'user',
        content: 'Hello',
        tool_calls: undefined,
        tool_call_id: undefined,
      });
      expect(result[2]).toEqual({
        role: 'assistant',
        content: 'Hi there!',
        tool_calls: undefined,
        tool_call_id: undefined,
      });
      expect(result[3]).toEqual({
        role: 'user',
        content: 'How are you?',
        tool_calls: undefined,
        tool_call_id: undefined,
      });
    });
  });

  describe('Case 4: request and response passed and ignoreRequestHistory is false', () => {
    it('should return all request messages plus response message when ignoreRequestHistory is false', () => {
      const result = convertToMessages(mockRequest, mockResponse, false);

      expect(result).toHaveLength(5);

      // First 4 messages should be all request messages
      expect(result[0].role).toBe('system');
      expect(result[1].role).toBe('user');
      expect(result[2].role).toBe('assistant');
      expect(result[3].role).toBe('user');

      // Last message should be the response message
      expect(result[4]).toEqual({
        role: 'assistant',
        content: 'I am doing well, thank you for asking!',
        tool_calls: undefined,
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty response choices', () => {
      const emptyResponse = { json: { choices: [] } };
      const result = convertToMessages(mockRequest, emptyResponse, true);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('How are you?');
    });

    it('should handle response without message', () => {
      const responseWithoutMessage = { json: { choices: [{}] } };
      const result = convertToMessages(
        mockRequest,
        responseWithoutMessage,
        true
      );

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('How are you?');
    });

    it('should handle content conversion for different content types', () => {
      const requestWithComplexContent = {
        json: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Hello' },
                { type: 'image', image_url: 'test.jpg' },
              ],
            },
          ],
        },
      };

      const result = convertToMessages(
        requestWithComplexContent,
        undefined,
        true
      );
      expect(result[0].content).toBe(
        'Hello\n{"type":"image","image_url":"test.jpg"}\n'
      );
    });

    it('should handle tool_calls and tool_call_id in request messages', () => {
      const requestWithToolCalls = {
        json: {
          messages: [
            {
              role: 'assistant',
              content: 'I will call a tool',
              tool_calls: [
                {
                  id: 'call_456',
                  type: 'function',
                  function: {
                    name: 'test_function',
                    arguments: '{"param": "value"}',
                  },
                },
              ],
            },
          ],
        },
      };

      const result = convertToMessages(requestWithToolCalls, undefined, true);
      expect(result[0].tool_calls).toEqual([
        {
          id: 'call_456',
          name: 'test_function',
          arguments: { param: 'value' },
        },
      ]);
    });
  });
});

describe('parseAvailableTools', () => {
  it('should return undefined when no tools are provided', () => {
    const request = { json: {} };
    const result = parseAvailableTools(request);
    expect(result).toBeUndefined();
  });

  it('should return undefined when tools array is empty', () => {
    const request = { json: { tools: [] } };
    const result = parseAvailableTools(request);
    expect(result).toBeUndefined();
  });

  it('should return undefined when no function tools are present', () => {
    const request = {
      json: {
        tools: [
          { type: 'retrieval', name: 'retrieval_tool' },
          { type: 'code_interpreter', name: 'code_tool' },
        ],
      },
    };
    const result = parseAvailableTools(request);
    expect(result).toBeUndefined();
  });

  it('should parse function tools correctly', () => {
    const request = {
      json: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather information for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
              },
            },
          },
        ],
      },
    };
    const result = parseAvailableTools(request);

    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      name: 'get_weather',
      description: 'Get weather information for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
      },
    });
  });

  it('should filter out non-function tools and only return function tools', () => {
    const request = {
      json: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather information',
              parameters: { type: 'object' },
            },
          },
          {
            type: 'retrieval',
            name: 'retrieval_tool',
          },
          {
            type: 'function',
            function: {
              name: 'calculate',
              description: 'Perform calculations',
              parameters: { type: 'object' },
            },
          },
        ],
      },
    };
    const result = parseAvailableTools(request);

    expect(result).toHaveLength(2);
    expect(result![0].name).toBe('get_weather');
    expect(result![1].name).toBe('calculate');
  });

  it('should handle request with undefined json', () => {
    const request = {};
    const result = parseAvailableTools(request);
    expect(result).toBeUndefined();
  });

  it('should handle request with null json', () => {
    const request = { json: null };
    const result = parseAvailableTools(request);
    expect(result).toBeUndefined();
  });
});

describe('dangerousContent handler', () => {
  // Mock the globals module before importing dangerousContent
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let dangerousContentHandler: any;

  beforeAll(() => {
    dangerousContentHandler = require('./dangerousContent').handler;
  });

  const mockContext = {
    request: {
      text: 'Hello, how are you?',
    },
    response: {
      text: 'I am doing well, thank you!',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    const eventTypes = [
      {
        type: 'beforeRequestHook',
        expectedBody: {
          input: 'Hello, how are you?',
          dangerous_content_check: true,
        },
      },
      {
        type: 'afterRequestHook',
        expectedBody: {
          input: 'Hello, how are you?',
          dangerous_content_check: true,
          output: 'I am doing well, thank you!',
        },
      },
    ];

    testCases.forEach(({ name, mockResponse }) => {
      eventTypes.forEach(({ type, expectedBody }) => {
        it(`should handle ${name} for ${type}`, async () => {
          const { postQualifire } = require('./globals');
          (postQualifire as jest.Mock).mockResolvedValue(mockResponse);

          const result = await dangerousContentHandler(
            mockContext,
            mockParameters,
            type as HookEventType
          );

          expect(postQualifire).toHaveBeenCalledWith(
            expectedBody,
            'test-api-key'
          );
          expect(result).toEqual(mockResponse);
        });
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Bad request');
      mockError.stack = 'Error: Bad request\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await dangerousContentHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('grounding handler', () => {
  // Mock the globals module before importing grounding
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let groundingHandler: any;

  beforeAll(() => {
    groundingHandler = require('./grounding').handler;
  });

  const mockContext = {
    request: {
      text: 'What is the capital of France?',
    },
    response: {
      text: 'The capital of France is Paris.',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await groundingHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What is the capital of France?',
          output: 'The capital of France is Paris.',
          grounding_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await groundingHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What is the capital of France?',
          output: 'The capital of France is Paris.',
          grounding_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when called with unsupported event types', () => {
    it('should return error for beforeRequestHook', async () => {
      const result = await groundingHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Grounding guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error for other event types', async () => {
      const result = await groundingHandler(
        mockContext,
        mockParameters,
        'onErrorHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Grounding guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('API timeout');
      mockError.stack = 'Error: API timeout\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await groundingHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('hallucinations handler', () => {
  // Mock the globals module before importing hallucinations
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let hallucinationsHandler: any;

  beforeAll(() => {
    hallucinationsHandler = require('./hallucinations').handler;
  });

  const mockContext = {
    request: {
      text: 'What are the main features of quantum computing?',
    },
    response: {
      text: 'Quantum computing features include superposition, entanglement, and quantum interference.',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await hallucinationsHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What are the main features of quantum computing?',
          output:
            'Quantum computing features include superposition, entanglement, and quantum interference.',
          hallucinations_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await hallucinationsHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What are the main features of quantum computing?',
          output:
            'Quantum computing features include superposition, entanglement, and quantum interference.',
          hallucinations_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when called with unsupported event types', () => {
    it('should return error for beforeRequestHook', async () => {
      const result = await hallucinationsHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Hallucinations guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error for other event types', async () => {
      const result = await hallucinationsHandler(
        mockContext,
        mockParameters,
        'onErrorHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Hallucinations guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Service unavailable');
      mockError.stack = 'Error: Service unavailable\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await hallucinationsHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('harassment handler', () => {
  // Mock the globals module before importing harassment
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let harassmentHandler: any;

  beforeAll(() => {
    harassmentHandler = require('./harassment').handler;
  });

  const mockContext = {
    request: {
      text: 'Hello, how are you today?',
    },
    response: {
      text: 'I am doing well, thank you for asking!',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    const eventTypes = [
      {
        type: 'beforeRequestHook',
        expectedBody: {
          input: 'Hello, how are you today?',
          harassment_check: true,
        },
      },
      {
        type: 'afterRequestHook',
        expectedBody: {
          input: 'Hello, how are you today?',
          harassment_check: true,
          output: 'I am doing well, thank you for asking!',
        },
      },
    ];

    testCases.forEach(({ name, mockResponse }) => {
      eventTypes.forEach(({ type, expectedBody }) => {
        it(`should handle ${name} for ${type}`, async () => {
          const { postQualifire } = require('./globals');
          (postQualifire as jest.Mock).mockResolvedValue(mockResponse);

          const result = await harassmentHandler(
            mockContext,
            mockParameters,
            type as HookEventType
          );

          expect(postQualifire).toHaveBeenCalledWith(
            expectedBody,
            'test-api-key'
          );
          expect(result).toEqual(mockResponse);
        });
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace for beforeRequestHook', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Timeout error');
      mockError.stack = 'Error: Timeout error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await harassmentHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });

    it('should handle API errors and remove stack trace for afterRequestHook', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Server error');
      mockError.stack = 'Error: Server error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await harassmentHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('hateSpeech handler', () => {
  // Mock the globals module before importing hateSpeech
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let hateSpeechHandler: any;

  beforeAll(() => {
    hateSpeechHandler = require('./hateSpeech').handler;
  });

  const mockContext = {
    request: {
      text: 'What is the weather like today?',
    },
    response: {
      text: 'The weather is sunny with clear skies.',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    const eventTypes = [
      {
        type: 'beforeRequestHook',
        expectedBody: {
          input: 'What is the weather like today?',
          hate_speech_check: true,
        },
      },
      {
        type: 'afterRequestHook',
        expectedBody: {
          input: 'What is the weather like today?',
          hate_speech_check: true,
          output: 'The weather is sunny with clear skies.',
        },
      },
    ];

    testCases.forEach(({ name, mockResponse }) => {
      eventTypes.forEach(({ type, expectedBody }) => {
        it(`should handle ${name} for ${type}`, async () => {
          const { postQualifire } = require('./globals');
          (postQualifire as jest.Mock).mockResolvedValue(mockResponse);

          const result = await hateSpeechHandler(
            mockContext,
            mockParameters,
            type as HookEventType
          );

          expect(postQualifire).toHaveBeenCalledWith(
            expectedBody,
            'test-api-key'
          );
          expect(result).toEqual(mockResponse);
        });
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace for beforeRequestHook', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Timeout error');
      mockError.stack = 'Error: Timeout error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await hateSpeechHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('instructionFollowing handler', () => {
  // Mock the globals module before importing instructionFollowing
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let instructionFollowingHandler: any;

  beforeAll(() => {
    instructionFollowingHandler = require('./instructionFollowing').handler;
  });

  const mockContext = {
    request: {
      text: 'Please write a short poem about nature.',
    },
    response: {
      text: "Here is a short poem about nature:\n\nWhispering trees in gentle breeze,\nNature's beauty puts my mind at ease.",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await instructionFollowingHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'Please write a short poem about nature.',
          output:
            "Here is a short poem about nature:\n\nWhispering trees in gentle breeze,\nNature's beauty puts my mind at ease.",
          instructions_following_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await instructionFollowingHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'Please write a short poem about nature.',
          output:
            "Here is a short poem about nature:\n\nWhispering trees in gentle breeze,\nNature's beauty puts my mind at ease.",
          instructions_following_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when called with unsupported event types', () => {
    it('should return error for beforeRequestHook', async () => {
      const result = await instructionFollowingHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Instruction Following guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error for other event types', async () => {
      const result = await instructionFollowingHandler(
        mockContext,
        mockParameters,
        'onErrorHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Instruction Following guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Timeout error');
      mockError.stack = 'Error: Timeout error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await instructionFollowingHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('javascript handler', () => {
  // Mock the globals module before importing javascript
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let javascriptHandler: any;

  beforeAll(() => {
    javascriptHandler = require('./javascript').handler;
  });

  const mockContext = {
    request: {
      text: 'Write a JavaScript function to calculate the factorial of a number.',
    },
    response: {
      text: 'Here is a JavaScript function to calculate factorial:\n\nfunction factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await javascriptHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input:
            'Write a JavaScript function to calculate the factorial of a number.',
          output:
            'Here is a JavaScript function to calculate factorial:\n\nfunction factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}',
          syntax_checks: {
            javascript: { args: '' },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await javascriptHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input:
            'Write a JavaScript function to calculate the factorial of a number.',
          output:
            'Here is a JavaScript function to calculate factorial:\n\nfunction factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}',
          syntax_checks: {
            javascript: { args: '' },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when called with unsupported event types', () => {
    it('should return error for beforeRequestHook', async () => {
      const result = await javascriptHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Javascript guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error for other event types', async () => {
      const result = await javascriptHandler(
        mockContext,
        mockParameters,
        'onErrorHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Javascript guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Server error');
      mockError.stack = 'Error: Server error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await javascriptHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('json handler', () => {
  // Mock the globals module before importing json
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let jsonHandler: any;

  beforeAll(() => {
    jsonHandler = require('./json').handler;
  });

  const mockContext = {
    request: {
      text: 'Generate a JSON response for a user profile with name, email, and age fields.',
    },
    response: {
      text: '{\n  "name": "John Doe",\n  "email": "john.doe@example.com",\n  "age": 30\n}',
    },
  };

  const mockParametersWithSchema = {
    credentials: {
      apiKey: 'test-api-key',
    },
    jsonSchema:
      '{"type": "object", "properties": {"name": {"type": "string"}, "email": {"type": "string"}, "age": {"type": "number"}}}',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for afterRequestHook with jsonSchema', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await jsonHandler(
        mockContext,
        mockParametersWithSchema,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input:
            'Generate a JSON response for a user profile with name, email, and age fields.',
          output:
            '{\n  "name": "John Doe",\n  "email": "john.doe@example.com",\n  "age": 30\n}',
          syntax_checks: {
            json: {
              args: '{"type": "object", "properties": {"name": {"type": "string"}, "email": {"type": "string"}, "age": {"type": "number"}}}',
            },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook with jsonSchema', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await jsonHandler(
        mockContext,
        mockParametersWithSchema,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input:
            'Generate a JSON response for a user profile with name, email, and age fields.',
          output:
            '{\n  "name": "John Doe",\n  "email": "john.doe@example.com",\n  "age": 30\n}',
          syntax_checks: {
            json: {
              args: '{"type": "object", "properties": {"name": {"type": "string"}, "email": {"type": "string"}, "age": {"type": "number"}}}',
            },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });

    it('should handle successful evaluation for afterRequestHook without jsonSchema', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await jsonHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input:
            'Generate a JSON response for a user profile with name, email, and age fields.',
          output:
            '{\n  "name": "John Doe",\n  "email": "john.doe@example.com",\n  "age": 30\n}',
          syntax_checks: {
            json: { args: '' },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });
  });

  describe('when called with unsupported event types', () => {
    it('should return error for beforeRequestHook', async () => {
      const result = await jsonHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire JSON guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error for other event types', async () => {
      const result = await jsonHandler(
        mockContext,
        mockParameters,
        'onErrorHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire JSON guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Timeout error');
      mockError.stack = 'Error: Timeout error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await jsonHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('length handler', () => {
  // Mock the globals module before importing length
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let lengthHandler: any;

  beforeAll(() => {
    lengthHandler = require('./length').handler;
  });

  const mockContext = {
    request: {
      text: 'Write a brief summary of machine learning.',
    },
    response: {
      text: 'Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.',
    },
  };

  const mockParametersWithConstraint = {
    credentials: {
      apiKey: 'test-api-key',
    },
    lengthConstraint: '<=100',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for afterRequestHook with lengthConstraint', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await lengthHandler(
        mockContext,
        mockParametersWithConstraint,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'Write a brief summary of machine learning.',
          output:
            'Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.',
          syntax_checks: {
            length: { args: '<=100' },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook with lengthConstraint', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await lengthHandler(
        mockContext,
        mockParametersWithConstraint,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'Write a brief summary of machine learning.',
          output:
            'Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.',
          syntax_checks: {
            length: { args: '<=100' },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when called with unsupported event types', () => {
    it('should return error for beforeRequestHook', async () => {
      const result = await lengthHandler(
        mockContext,
        mockParametersWithConstraint,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Length guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error for other event types', async () => {
      const result = await lengthHandler(
        mockContext,
        mockParametersWithConstraint,
        'onErrorHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Length guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when lengthConstraint is missing', () => {
    it('should return error when lengthConstraint is not provided', async () => {
      const result = await lengthHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Length guardrail requires a length constraint to be provided.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error when lengthConstraint is undefined', async () => {
      const result = await lengthHandler(
        mockContext,
        { credentials: { apiKey: 'test-api-key' } },
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Length guardrail requires a length constraint to be provided.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Server error');
      mockError.stack = 'Error: Server error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await lengthHandler(
        mockContext,
        mockParametersWithConstraint,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('wordCount handler', () => {
  // Mock the globals module before importing wordCount
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let wordCountHandler: any;

  beforeAll(() => {
    wordCountHandler = require('./wordCount').handler;
  });

  const mockContext = {
    request: {
      text: 'Explain quantum computing in simple terms.',
    },
    response: {
      text: 'Quantum computing uses quantum mechanical phenomena like superposition and entanglement to process information in ways that classical computers cannot.',
    },
  };

  const mockParametersWithConstraint = {
    credentials: {
      apiKey: 'test-api-key',
    },
    wordCountConstraint: '>10',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for afterRequestHook with wordCountConstraint', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await wordCountHandler(
        mockContext,
        mockParametersWithConstraint,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'Explain quantum computing in simple terms.',
          output:
            'Quantum computing uses quantum mechanical phenomena like superposition and entanglement to process information in ways that classical computers cannot.',
          syntax_checks: {
            word_count: { args: '>10' },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook with wordCountConstraint', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await wordCountHandler(
        mockContext,
        mockParametersWithConstraint,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when called with unsupported event types', () => {
    it('should return error for beforeRequestHook', async () => {
      const result = await wordCountHandler(
        mockContext,
        mockParametersWithConstraint,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Word Count guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error for other event types', async () => {
      const result = await wordCountHandler(
        mockContext,
        mockParametersWithConstraint,
        'onErrorHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Word Count guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when wordCountConstraint is missing', () => {
    it('should return error when wordCountConstraint is not provided', async () => {
      const result = await wordCountHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Word Count guardrail requires a word count constraint to be provided.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error when wordCountConstraint is undefined', async () => {
      const result = await wordCountHandler(
        mockContext,
        { credentials: { apiKey: 'test-api-key' } },
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message:
            'Qualifire Word Count guardrail requires a word count constraint to be provided.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Timeout error');
      mockError.stack = 'Error: Timeout error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await wordCountHandler(
        mockContext,
        mockParametersWithConstraint,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('pii handler', () => {
  // Mock the globals module before importing pii
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let piiHandler: any;

  beforeAll(() => {
    piiHandler = require('./pii').handler;
  });

  const mockContext = {
    request: {
      text: 'What is the email address for John Smith?',
    },
    response: {
      text: 'I cannot provide personal email addresses as that would be a privacy concern.',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for beforeRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await piiHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What is the email address for John Smith?',
          pii_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for beforeRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await piiHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What is the email address for John Smith?',
          pii_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });

    it('should handle successful evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await piiHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What is the email address for John Smith?',
          output:
            'I cannot provide personal email addresses as that would be a privacy concern.',
          pii_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await piiHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What is the email address for John Smith?',
          output:
            'I cannot provide personal email addresses as that would be a privacy concern.',
          pii_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace for beforeRequestHook', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Server error');
      mockError.stack = 'Error: Server error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await piiHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });

    it('should handle API errors and remove stack trace for afterRequestHook', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Timeout error');
      mockError.stack = 'Error: Timeout error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await piiHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('sql handler', () => {
  // Mock the globals module before importing sql
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let sqlHandler: any;

  beforeAll(() => {
    sqlHandler = require('./sql').handler;
  });

  const mockContext = {
    request: {
      text: 'Write a SQL query to select all users from the users table.',
    },
    response: {
      text: 'SELECT * FROM users;',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await sqlHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'Write a SQL query to select all users from the users table.',
          output: 'SELECT * FROM users;',
          syntax_checks: {
            sql: { args: '' },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await sqlHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'Write a SQL query to select all users from the users table.',
          output: 'SELECT * FROM users;',
          syntax_checks: {
            sql: { args: '' },
          },
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when called with unsupported event types', () => {
    it('should return error for beforeRequestHook', async () => {
      const result = await sqlHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message: 'Qualifire SQL guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });

    it('should return error for other event types', async () => {
      const result = await sqlHandler(
        mockContext,
        mockParameters,
        'onErrorHook' as HookEventType
      );

      expect(result).toEqual({
        error: {
          message: 'Qualifire SQL guardrail only supports after_request_hooks.',
        },
        verdict: true,
        data: null,
      });
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Server error');
      mockError.stack = 'Error: Server error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await sqlHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});

describe('sexualContent handler', () => {
  // Mock the globals module before importing sexualContent
  jest.mock('./globals', () => ({
    postQualifire: jest.fn(),
  }));

  let sexualContentHandler: any;

  beforeAll(() => {
    sexualContentHandler = require('./sexualContent').handler;
  });

  const mockContext = {
    request: {
      text: 'What are the health benefits of exercise?',
    },
    response: {
      text: 'Exercise provides numerous health benefits including improved cardiovascular health, stronger muscles, better mental health, and increased energy levels.',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when evaluation completes (success or failure)', () => {
    const testCases = [
      {
        name: 'successful evaluation',
        mockResponse: mockSuccessfulEvaluation,
      },
      {
        name: 'failed evaluation',
        mockResponse: mockFailedEvaluation,
      },
    ];

    it('should handle successful evaluation for beforeRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await sexualContentHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What are the health benefits of exercise?',
          sexual_content_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for beforeRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await sexualContentHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What are the health benefits of exercise?',
          sexual_content_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });

    it('should handle successful evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[0].mockResponse);

      const result = await sexualContentHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What are the health benefits of exercise?',
          output:
            'Exercise provides numerous health benefits including improved cardiovascular health, stronger muscles, better mental health, and increased energy levels.',
          sexual_content_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[0].mockResponse);
    });

    it('should handle failed evaluation for afterRequestHook', async () => {
      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockResolvedValue(testCases[1].mockResponse);

      const result = await sexualContentHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(postQualifire).toHaveBeenCalledWith(
        {
          input: 'What are the health benefits of exercise?',
          output:
            'Exercise provides numerous health benefits including improved cardiovascular health, stronger muscles, better mental health, and increased energy levels.',
          sexual_content_check: true,
        },
        'test-api-key'
      );
      expect(result).toEqual(testCases[1].mockResponse);
    });
  });

  describe('when an error is raised', () => {
    it('should handle API errors and remove stack trace for beforeRequestHook', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Timeout error');
      mockError.stack = 'Error: Timeout error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await sexualContentHandler(
        mockContext,
        mockParameters,
        'beforeRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });

    it('should handle API errors and remove stack trace for afterRequestHook', async () => {
      // Mock postQualifire to throw an error
      const mockError = new Error('Server error');
      mockError.stack = 'Error: Server error\n    at postQualifire';

      const { postQualifire } = require('./globals');
      (postQualifire as jest.Mock).mockRejectedValue(mockError);

      const result = await sexualContentHandler(
        mockContext,
        mockParameters,
        'afterRequestHook' as HookEventType
      );

      expect(result).toEqual({
        error: mockError,
        verdict: false,
        data: null,
      });

      // Verify stack was removed
      expect(result.error.stack).toBeUndefined();
    });
  });
});
