// Test suite for Google Vertex AI (Gemini) thought signature support
jest.mock('../../../data-stores/redis', () => ({
  redisClient: null,
  redisReaderClient: null,
}));

jest.mock('../../../utils/awsAuth', () => ({}));

jest.mock('../../..', () => ({}));

import { VertexGoogleChatCompleteConfig } from '../chatComplete';
import { transformUsingProviderConfig } from '../../../services/transformToProviderRequest';
import { Params } from '../../../types/requestBody';

describe('Google Vertex AI Thought Signature Support', () => {
  describe('gemini-2.5-flash model', () => {
    it('should NOT have thought signature in transformed request when thought signature is not sent', () => {
      const params = {
        model: 'gemini-2.5-flash',
        max_tokens: 1000,
        stream: false,
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'You are a helpful assistant',
              },
            ],
          },
          {
            role: 'user',
            content: 'Check the time in Chennai',
          },
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'portkey-af08990b-a18f-4322-83e0-95e8987788f3',
                type: 'function',
                function: {
                  name: 'get_current_time',
                  arguments: '{"location":"Chennai, India"}',
                  // No thought_signature provided
                },
              },
            ],
          },
          {
            role: 'tool',
            content: "{ 'time': '10PM' }",
            tool_call_id: 'toolu_014jEfKqGbfFvRaKfiauxgPv',
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_current_time',
              description: 'Get the current time for a specific location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g., San Francisco, CA',
                  },
                },
                required: ['location'],
              },
            },
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        VertexGoogleChatCompleteConfig,
        params
      );

      // Find the assistant message with tool calls
      const assistantContent = transformedRequest.contents.find(
        (content: any) =>
          content.role === 'model' &&
          content.parts.some((part: any) => part.functionCall)
      );

      expect(assistantContent).toBeDefined();
      expect(assistantContent.parts).toHaveLength(1);
      expect(assistantContent.parts[0]).toHaveProperty('functionCall');
      expect(assistantContent.parts[0].functionCall).toEqual({
        name: 'get_current_time',
        args: {
          location: 'Chennai, India',
        },
      });
      // Should NOT have thoughtSignature for gemini-2.5 models
      expect(assistantContent.parts[0]).not.toHaveProperty('thoughtSignature');
    });

    it('should have thought signature in transformed request when thought signature is sent', () => {
      const thoughtSig =
        'CrgEAePx/16x6UFQ4IW6ktaAOFhPV2qvOB0kBc6nEO4Q7/iQLPN1FCMUm3QiKmBrKqUxEGAqIX/GIoQQHqpbcl8DeVIG3SxJFpZ0SM+ntuQSH2/YEBNmn59ZvVAs6COi+NCEcKblGF6mKkplMi+QOp4JK52ByUjJcdePWlRHccV6MuhOWfpXMd07M0Nyi1fGntXf7icn2RD5x3QPfINs3b1dFjEWA+4vXpTucD5w3errK3xRAncUPQcGrPDq5pZkvAkjo9XRGzchsQksvb/DCgOqlURO4oUdgsey5EhS1oi0Y34SBC/4wJ0aGeA4wE1L57dNYK8cgyUIiGYZioHj5cf6NXmv1g48rgRfuuDv210d6QCYIXNq+PwhdTZWoXll0tuuZpXdNDaNYMb1L5m3gPS10Eja0YQmiVj8Gxy8Lz33R6qsQzuNt55vMSWoW9uQZvRX+r6wbzr5si0bYrDNsRyYTAXz5CHepxdiThh8COXYnxQH5hvl65wk0rmVvBCI4ArVMXqZBNIN0EKzQ2wbvJOqyMda38Irbcp4xzH7rEldAtC6V28NuqNLYLuG22+FmGIGYp87tE350fBzs7KgUjTE3OPXxvLCR3IL7I7/rkFOFDB01UGcIhSGQ561eOysMGQGYY4U3obk7zDiscQoV4GAoB1jnyrWvN0RSjic3FeL0rfDVmtnISICAEuvhGIFnel/jfjTtwkzqYuxUHiNMLMka3qXfzxcXlli7oIXoJSPE60VnUBoISXvTg==';

      const params = {
        model: 'gemini-2.5-flash',
        max_tokens: 1000,
        stream: false,
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'You are a helpful assistant',
              },
            ],
          },
          {
            role: 'user',
            content:
              'Check the time in Chennai and if it is later than 9PM get the temperature',
          },
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'portkey-af08990b-a18f-4322-83e0-95e8987788f3',
                type: 'function',
                function: {
                  name: 'get_current_time',
                  arguments: '{"location":"Mumbai, India"}',
                  thought_signature: thoughtSig,
                },
              },
            ],
          },
          {
            role: 'tool',
            content: "{ 'time': '10PM' }",
            tool_call_id: 'toolu_014jEfKqGbfFvRaKfiauxgPv',
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_current_time',
              description: 'Get the current time for a specific location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g., San Francisco, CA',
                  },
                },
                required: ['location'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'get_current_temperature',
              description:
                'Get the current temperature for a specific location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g., San Francisco, CA',
                  },
                  unit: {
                    type: 'string',
                    enum: ['Celsius', 'Fahrenheit'],
                    description:
                      "The temperature unit to use. Infer this from the user's location.",
                  },
                },
                required: ['location', 'unit'],
              },
            },
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        VertexGoogleChatCompleteConfig,
        params
      );

      // Find the assistant message with tool calls
      const assistantContent = transformedRequest.contents.find(
        (content: any) =>
          content.role === 'model' &&
          content.parts.some((part: any) => part.functionCall)
      );

      expect(assistantContent).toBeDefined();
      expect(assistantContent.parts).toHaveLength(1);
      expect(assistantContent.parts[0]).toHaveProperty('functionCall');
      expect(assistantContent.parts[0].functionCall).toEqual({
        name: 'get_current_time',
        args: {
          location: 'Mumbai, India',
        },
      });
      // Should have thoughtSignature when provided explicitly
      expect(assistantContent.parts[0]).toHaveProperty('thoughtSignature');
      expect(assistantContent.parts[0].thoughtSignature).toBe(thoughtSig);
    });
  });

  describe('gemini-3-flash-preview model', () => {
    it('should have thought signature in final request when thought signature is not sent', () => {
      const params = {
        model: 'gemini-3-flash-preview',
        max_tokens: 1000,
        stream: false,
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'You are a helpful assistant',
              },
            ],
          },
          {
            role: 'user',
            content: 'Check the time in Chennai',
          },
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'portkey-af08990b-a18f-4322-83e0-95e8987788f3',
                type: 'function',
                function: {
                  name: 'get_current_time',
                  arguments: '{"location":"Chennai, India"}',
                  // No thought_signature provided
                },
              },
            ],
          },
          {
            role: 'tool',
            content: "{ 'time': '10PM' }",
            tool_call_id: 'toolu_014jEfKqGbfFvRaKfiauxgPv',
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_current_time',
              description: 'Get the current time for a specific location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g., San Francisco, CA',
                  },
                },
                required: ['location'],
              },
            },
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        VertexGoogleChatCompleteConfig,
        params
      );

      // Find the assistant message with tool calls
      const assistantContent = transformedRequest.contents.find(
        (content: any) =>
          content.role === 'model' &&
          content.parts.some((part: any) => part.functionCall)
      );

      expect(assistantContent).toBeDefined();
      expect(assistantContent.parts).toHaveLength(1);
      expect(assistantContent.parts[0]).toHaveProperty('functionCall');
      expect(assistantContent.parts[0].functionCall).toEqual({
        name: 'get_current_time',
        args: {
          location: 'Chennai, India',
        },
      });
      // Should have default thought signature for gemini-3 models even when not provided
      expect(assistantContent.parts[0]).toHaveProperty('thoughtSignature');
      expect(assistantContent.parts[0].thoughtSignature).toBe(
        'skip_thought_signature_validator'
      );
    });

    it('should have thought signature in final request when thought signature is sent', () => {
      const thoughtSig =
        'CrgEAePx/16x6UFQ4IW6ktaAOFhPV2qvOB0kBc6nEO4Q7/iQLPN1FCMUm3QiKmBrKqUxEGAqIX/GIoQQHqpbcl8DeVIG3SxJFpZ0SM+ntuQSH2/YEBNmn59ZvVAs6COi+NCEcKblGF6mKkplMi+QOp4JK52ByUjJcdePWlRHccV6MuhOWfpXMd07M0Nyi1fGntXf7icn2RD5x3QPfINs3b1dFjEWA+4vXpTucD5w3errK3xRAncUPQcGrPDq5pZkvAkjo9XRGzchsQksvb/DCgOqlURO4oUdgsey5EhS1oi0Y34SBC/4wJ0aGeA4wE1L57dNYK8cgyUIiGYZioHj5cf6NXmv1g48rgRfuuDv210d6QCYIXNq+PwhdTZWoXll0tuuZpXdNDaNYMb1L5m3gPS10Eja0YQmiVj8Gxy8Lz33R6qsQzuNt55vMSWoW9uQZvRX+r6wbzr5si0bYrDNsRyYTAXz5CHepxdiThh8COXYnxQH5hvl65wk0rmVvBCI4ArVMXqZBNIN0EKzQ2wbvJOqyMda38Irbcp4xzH7rEldAtC6V28NuqNLYLuG22+FmGIGYp87tE350fBzs7KgUjTE3OPXxvLCR3IL7I7/rkFOFDB01UGcIhSGQ561eOysMGQGYY4U3obk7zDiscQoV4GAoB1jnyrWvN0RSjic3FeL0rfDVmtnISICAEuvhGIFnel/jfjTtwkzqYuxUHiNMLMka3qXfzxcXlli7oIXoJSPE60VnUBoISXvTg==';

      const params = {
        model: 'gemini-3-flash-preview',
        max_tokens: 1000,
        stream: false,
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'You are a helpful assistant',
              },
            ],
          },
          {
            role: 'user',
            content:
              'Check the time in Chennai and if it is later than 9PM get the temperature',
          },
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'portkey-af08990b-a18f-4322-83e0-95e8987788f3',
                type: 'function',
                function: {
                  name: 'get_current_time',
                  arguments: '{"location":"Mumbai, India"}',
                  thought_signature: thoughtSig,
                },
              },
            ],
          },
          {
            role: 'tool',
            content: "{ 'time': '10PM' }",
            tool_call_id: 'toolu_014jEfKqGbfFvRaKfiauxgPv',
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_current_time',
              description: 'Get the current time for a specific location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g., San Francisco, CA',
                  },
                },
                required: ['location'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'get_current_temperature',
              description:
                'Get the current temperature for a specific location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g., San Francisco, CA',
                  },
                  unit: {
                    type: 'string',
                    enum: ['Celsius', 'Fahrenheit'],
                    description:
                      "The temperature unit to use. Infer this from the user's location.",
                  },
                },
                required: ['location', 'unit'],
              },
            },
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        VertexGoogleChatCompleteConfig,
        params
      );

      // Find the assistant message with tool calls
      const assistantContent = transformedRequest.contents.find(
        (content: any) =>
          content.role === 'model' &&
          content.parts.some((part: any) => part.functionCall)
      );

      expect(assistantContent).toBeDefined();
      expect(assistantContent.parts).toHaveLength(1);
      expect(assistantContent.parts[0]).toHaveProperty('functionCall');
      expect(assistantContent.parts[0].functionCall).toEqual({
        name: 'get_current_time',
        args: {
          location: 'Mumbai, India',
        },
      });
      // Should use the provided thought signature when available
      expect(assistantContent.parts[0]).toHaveProperty('thoughtSignature');
      expect(assistantContent.parts[0].thoughtSignature).toBe(thoughtSig);
    });
  });

  describe('Multiple tool calls with thought signatures', () => {
    it('should handle multiple tool calls with mixed thought signatures', () => {
      const thoughtSig1 =
        'CrgEAePx/16x6UFQ4IW6ktaAOFhPV2qvOB0kBc6nEO4Q7/iQLPN1FCMUm3QiKmBrKqUxEGAqIX/GIoQQHqpbcl8DeVIG3SxJFpZ0SM+ntuQSH2/YEBNmn59ZvVAs6COi+NCEcKblGF6mKkplMi+QOp4JK52ByUjJcdePWlRHccV6MuhOWfpXMd07M0Nyi1fGntXf7icn2RD5x3QPfINs3b1dFjEWA+4vXpTucD5w3errK3xRAncUPQcGrPDq5pZkvAkjo9XRGzchsQksvb/DCgOqlURO4oUdgsey5EhS1oi0Y34SBC/4wJ0aGeA4wE1L57dNYK8cgyUIiGYZioHj5cf6NXmv1g48rgRfuuDv210d6QCYIXNq+PwhdTZWoXll0tuuZpXdNDaNYMb1L5m3gPS10Eja0YQmiVj8Gxy8Lz33R6qsQzuNt55vMSWoW9uQZvRX+r6wbzr5si0bYrDNsRyYTAXz5CHepxdiThh8COXYnxQH5hvl65wk0rmVvBCI4ArVMXqZBNIN0EKzQ2wbvJOqyMda38Irbcp4xzH7rEldAtC6V28NuqNLYLuG22+FmGIGYp87tE350fBzs7KgUjTE3OPXxvLCR3IL7I7/rkFOFDB01UGcIhSGQ561eOysMGQGYY4U3obk7zDiscQoV4GAoB1jnyrWvN0RSjic3FeL0rfDVmtnISICAEuvhGIFnel/jfjTtwkzqYuxUHiNMLMka3qXfzxcXlli7oIXoJSPE60VnUBoISXvTg==';
      const thoughtSig2 = 'DifferentSignatureForSecondToolCall123456789ABCDEF';

      const params = {
        model: 'gemini-3-pro-preview',
        max_tokens: 1000,
        stream: false,
        messages: [
          {
            role: 'user',
            content: 'Get time and temperature for Chennai',
          },
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'get_current_time',
                  arguments: '{"location":"Chennai, India"}',
                  thought_signature: thoughtSig1,
                },
              },
              {
                id: 'call-2',
                type: 'function',
                function: {
                  name: 'get_current_temperature',
                  arguments: '{"location":"Chennai, India", "unit":"Celsius"}',
                  thought_signature: thoughtSig2,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_current_time',
              description: 'Get the current time',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'get_current_temperature',
              description: 'Get the current temperature',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                  unit: { type: 'string' },
                },
                required: ['location', 'unit'],
              },
            },
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        VertexGoogleChatCompleteConfig,
        params
      );

      // Find the assistant message with tool calls
      const assistantContent = transformedRequest.contents.find(
        (content: any) =>
          content.role === 'model' &&
          content.parts.some((part: any) => part.functionCall)
      );

      expect(assistantContent).toBeDefined();
      expect(assistantContent.parts).toHaveLength(2);

      // Check first tool call
      expect(assistantContent.parts[0]).toHaveProperty('functionCall');
      expect(assistantContent.parts[0].functionCall.name).toBe(
        'get_current_time'
      );
      expect(assistantContent.parts[0]).toHaveProperty('thoughtSignature');
      expect(assistantContent.parts[0].thoughtSignature).toBe(thoughtSig1);

      // Check second tool call
      expect(assistantContent.parts[1]).toHaveProperty('functionCall');
      expect(assistantContent.parts[1].functionCall.name).toBe(
        'get_current_temperature'
      );
      expect(assistantContent.parts[1]).toHaveProperty('thoughtSignature');
      expect(assistantContent.parts[1].thoughtSignature).toBe(thoughtSig2);
    });
  });

  describe('Edge cases', () => {
    it('should handle gemini-1.5 models (no thought signature required)', () => {
      const params = {
        model: 'gemini-1.5-pro',
        messages: [
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{"arg":"value"}',
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_function',
              description: 'A test function',
              parameters: {
                type: 'object',
                properties: { arg: { type: 'string' } },
              },
            },
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        VertexGoogleChatCompleteConfig,
        params
      );

      const assistantContent = transformedRequest.contents.find(
        (content: any) =>
          content.role === 'model' &&
          content.parts.some((part: any) => part.functionCall)
      );

      expect(assistantContent.parts[0]).not.toHaveProperty('thoughtSignature');
    });

    it('should handle gemini-2.0 models (no thought signature required)', () => {
      const params = {
        model: 'gemini-2.0-flash',
        messages: [
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{"arg":"value"}',
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_function',
              description: 'A test function',
              parameters: {
                type: 'object',
                properties: { arg: { type: 'string' } },
              },
            },
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        VertexGoogleChatCompleteConfig,
        params
      );

      const assistantContent = transformedRequest.contents.find(
        (content: any) =>
          content.role === 'model' &&
          content.parts.some((part: any) => part.functionCall)
      );

      expect(assistantContent.parts[0]).not.toHaveProperty('thoughtSignature');
    });

    it('should prioritize explicit thought_signature over default for gemini-3 models', () => {
      const customSig = 'custom_signature_value';

      const params = {
        model: 'gemini-3-flash-preview',
        messages: [
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{"arg":"value"}',
                  thought_signature: customSig,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_function',
              description: 'A test function',
              parameters: {
                type: 'object',
                properties: { arg: { type: 'string' } },
              },
            },
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        VertexGoogleChatCompleteConfig,
        params
      );

      const assistantContent = transformedRequest.contents.find(
        (content: any) =>
          content.role === 'model' &&
          content.parts.some((part: any) => part.functionCall)
      );

      expect(assistantContent.parts[0].thoughtSignature).toBe(customSig);
      expect(assistantContent.parts[0].thoughtSignature).not.toBe(
        'skip_thought_signature_validator'
      );
    });
  });
});
