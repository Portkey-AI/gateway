import {
  OracleChatCompleteConfig,
  OracleChatDetailsConfig,
  OracleChatCompleteResponseTransform,
  OracleChatCompleteStreamChunkTransform,
  OracleStreamState,
  initOracleStreamState,
} from '../../../../../src/providers/oracle/chatComplete';
import { Params } from '../../../../../src/types/requestBody';

describe('Oracle Chat Complete Provider', () => {
  describe('initOracleStreamState', () => {
    it('should initialize stream state with default values', () => {
      const state = initOracleStreamState();
      expect(state.currentToolCallIndex).toBe(-1);
      expect(state.seenToolCallIds).toBeInstanceOf(Set);
      expect(state.seenToolCallIds.size).toBe(0);
      expect(state.finishReason).toBeUndefined();
    });
  });

  describe('OracleChatDetailsConfig - Message Transformation', () => {
    const messagesConfig = OracleChatDetailsConfig.messages as any;
    const transform = messagesConfig.transform;

    describe('Text Content', () => {
      it('should transform string content to TEXT type', () => {
        const params: Params = {
          messages: [{ role: 'user', content: 'Hello world' }],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          { type: 'TEXT', text: 'Hello world' },
        ]);
        expect(result[0].role).toBe('USER');
      });

      it('should transform text type content objects', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello from array' }],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          { type: 'TEXT', text: 'Hello from array' },
        ]);
      });

      it('should transform string items in content array', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: ['First message', 'Second message'] as any,
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          { type: 'TEXT', text: 'First message' },
          { type: 'TEXT', text: 'Second message' },
        ]);
      });
    });

    describe('Role Mapping', () => {
      it('should map user role to USER', () => {
        const params: Params = {
          messages: [{ role: 'user', content: 'test' }],
        };
        const result = transform(params);
        expect(result[0].role).toBe('USER');
      });

      it('should map assistant role to ASSISTANT', () => {
        const params: Params = {
          messages: [{ role: 'assistant', content: 'test' }],
        };
        const result = transform(params);
        expect(result[0].role).toBe('ASSISTANT');
      });

      it('should map system role to SYSTEM', () => {
        const params: Params = {
          messages: [{ role: 'system', content: 'test' }],
        };
        const result = transform(params);
        expect(result[0].role).toBe('SYSTEM');
      });

      it('should map tool role to TOOL', () => {
        const params: Params = {
          messages: [{ role: 'tool', content: 'test', tool_call_id: 'tc_123' }],
        };
        const result = transform(params);
        expect(result[0].role).toBe('TOOL');
      });

      it('should map developer role to SYSTEM', () => {
        const params: Params = {
          messages: [{ role: 'developer', content: 'test' }],
        };
        const result = transform(params);
        expect(result[0].role).toBe('SYSTEM');
      });
    });

    describe('Image Content', () => {
      it('should transform image_url content', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: 'data:image/png;base64,abc123',
                    detail: 'high',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'IMAGE',
            imageUrl: {
              url: 'data:image/png;base64,abc123',
              detail: 'high',
            },
          },
        ]);
      });
    });

    describe('Audio Content', () => {
      it('should transform input_audio content', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: 'base64audiodata',
                    format: 'wav',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'AUDIO',
            audioUrl: {
              url: 'base64audiodata',
            },
          },
        ]);
      });
    });

    describe('Document Content', () => {
      it('should transform document_url content', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document_url',
                  document_url: {
                    url: 'data:application/pdf;base64,pdfdata',
                  },
                },
              ],
            },
          ],
        } as any;
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'DOCUMENT',
            documentUrl: {
              url: 'data:application/pdf;base64,pdfdata',
            },
          },
        ]);
      });

      it('should transform document type content', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  document: {
                    url: 'data:application/pdf;base64,pdfdata',
                  },
                },
              ],
            },
          ],
        } as any;
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'DOCUMENT',
            documentUrl: {
              url: 'data:application/pdf;base64,pdfdata',
            },
          },
        ]);
      });
    });

    describe('Video Content', () => {
      it('should transform video_url content', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'video_url',
                  video_url: {
                    url: 'data:video/mp4;base64,videodata',
                  },
                },
              ],
            },
          ],
        } as any;
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'VIDEO',
            videoUrl: {
              url: 'data:video/mp4;base64,videodata',
            },
          },
        ]);
      });

      it('should transform video type content', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'video',
                  video: {
                    url: 'data:video/mp4;base64,videodata',
                  },
                },
              ],
            },
          ],
        } as any;
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'VIDEO',
            videoUrl: {
              url: 'data:video/mp4;base64,videodata',
            },
          },
        ]);
      });
    });

    describe('File Content with MIME Type Detection', () => {
      it('should detect image files by mime_type', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  file: {
                    file_data: 'base64imagedata',
                    mime_type: 'image/jpeg',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'IMAGE',
            imageUrl: { url: 'base64imagedata' },
          },
        ]);
      });

      it('should detect video files by mime_type', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  file: {
                    file_data: 'base64videodata',
                    mime_type: 'video/mp4',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'VIDEO',
            videoUrl: { url: 'base64videodata' },
          },
        ]);
      });

      it('should detect audio files by mime_type', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  file: {
                    file_data: 'base64audiodata',
                    mime_type: 'audio/wav',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'AUDIO',
            audioUrl: { url: 'base64audiodata' },
          },
        ]);
      });

      it('should default to document for PDF files', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  file: {
                    file_data: 'base64pdfdata',
                    mime_type: 'application/pdf',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'DOCUMENT',
            documentUrl: { url: 'base64pdfdata' },
          },
        ]);
      });

      it('should use file_url when file_data is not available', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  file: {
                    file_url: 'https://example.com/doc.pdf',
                    mime_type: 'application/pdf',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toEqual([
          {
            type: 'DOCUMENT',
            documentUrl: { url: 'https://example.com/doc.pdf' },
          },
        ]);
      });
    });

    describe('Tool Calls in Messages', () => {
      it('should include tool calls for assistant messages', () => {
        const params: Params = {
          messages: [
            {
              role: 'assistant',
              content: 'I will call a function',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "NYC"}',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].toolCalls).toEqual([
          {
            id: 'call_123',
            type: 'FUNCTION',
            name: 'get_weather',
            arguments: '{"location": "NYC"}',
          },
        ]);
      });

      it('should handle multiple tool calls', () => {
        const params: Params = {
          messages: [
            {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'func_a',
                    arguments: '{}',
                  },
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'func_b',
                    arguments: '{"x": 1}',
                  },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].toolCalls).toHaveLength(2);
        expect(result[0].toolCalls[0].name).toBe('func_a');
        expect(result[0].toolCalls[1].name).toBe('func_b');
      });

      it('should handle custom tool type', () => {
        const params: Params = {
          messages: [
            {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_custom',
                  type: 'custom',
                  custom: {
                    name: 'custom_tool',
                    input: '{"data": "value"}',
                  },
                },
              ],
            },
          ],
        } as any;
        const result = transform(params);
        expect(result[0].toolCalls).toEqual([
          {
            id: 'call_custom',
            type: 'FUNCTION',
            name: 'custom_tool',
            arguments: '{"data": "value"}',
          },
        ]);
      });
    });

    describe('Tool Call ID for Tool Messages', () => {
      it('should include tool_call_id for tool messages', () => {
        const params: Params = {
          messages: [
            {
              role: 'tool',
              content: '{"result": "sunny"}',
              tool_call_id: 'call_123',
            },
          ],
        };
        const result = transform(params);
        expect(result[0].toolCallId).toBe('call_123');
        expect(result[0].role).toBe('TOOL');
      });

      it('should not include toolCallId for non-tool messages', () => {
        const params: Params = {
          messages: [{ role: 'user', content: 'Hello' }],
        };
        const result = transform(params);
        expect(result[0].toolCallId).toBeUndefined();
      });
    });

    describe('Mixed Content', () => {
      it('should handle mixed text and image content', () => {
        const params: Params = {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What is in this image?' },
                {
                  type: 'image_url',
                  image_url: { url: 'data:image/png;base64,abc' },
                },
              ],
            },
          ],
        };
        const result = transform(params);
        expect(result[0].content).toHaveLength(2);
        expect(result[0].content[0].type).toBe('TEXT');
        expect(result[0].content[1].type).toBe('IMAGE');
      });
    });
  });

  describe('OracleChatDetailsConfig - Tools Transformation', () => {
    const toolsConfig = OracleChatDetailsConfig.tools as any;
    const transform = toolsConfig.transform;

    it('should transform function tools', () => {
      const params: Params = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
              },
            },
          },
        ],
      };
      const result = transform(params);
      expect(result).toEqual([
        {
          type: 'FUNCTION',
          name: 'get_weather',
          description: 'Get weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
          },
        },
      ]);
    });

    it('should return undefined when no tools', () => {
      const params: Params = {};
      const result = transform(params);
      expect(result).toBeUndefined();
    });

    it('should handle custom tool type', () => {
      const params: Params = {
        tools: [
          {
            type: 'custom',
            custom: {
              name: 'custom_tool',
              description: 'A custom tool',
            },
          },
        ],
      } as any;
      const result = transform(params);
      expect(result).toEqual([
        {
          type: 'FUNCTION',
          name: 'custom_tool',
          description: 'A custom tool',
        },
      ]);
    });
  });

  describe('OracleChatDetailsConfig - Tool Choice Transformation', () => {
    const toolChoiceConfig = OracleChatDetailsConfig.tool_choice as any;
    const transform = toolChoiceConfig.transform;

    it('should transform string tool_choice to uppercase', () => {
      expect(transform({ tool_choice: 'auto' })).toEqual({ type: 'AUTO' });
      expect(transform({ tool_choice: 'none' })).toEqual({ type: 'NONE' });
      expect(transform({ tool_choice: 'required' })).toEqual({
        type: 'REQUIRED',
      });
    });

    it('should transform function tool_choice', () => {
      const params: Params = {
        tool_choice: {
          type: 'function',
          function: { name: 'get_weather' },
        },
      };
      const result = transform(params);
      expect(result).toEqual({
        type: 'FUNCTION',
        name: 'get_weather',
      });
    });

    it('should transform custom tool_choice', () => {
      const params: Params = {
        tool_choice: {
          type: 'custom',
          custom: { name: 'custom_func' },
        },
      } as any;
      const result = transform(params);
      expect(result).toEqual({
        type: 'FUNCTION',
        name: 'custom_func',
      });
    });
  });

  describe('OracleChatCompleteResponseTransform', () => {
    const mockHeaders = new Headers();

    describe('Successful Response', () => {
      it('should transform basic chat response', () => {
        const response = {
          modelId: 'meta.llama-3.1-70b-instruct',
          modelVersion: '1.0',
          chatResponse: {
            timeCreated: new Date('2024-01-01T00:00:00Z'),
            apiFormat: 'GENERIC',
            choices: [
              {
                index: 0,
                message: {
                  role: 'ASSISTANT',
                  content: [{ type: 'TEXT', text: 'Hello!' }],
                },
                finishReason: 'stop',
              },
            ],
            usage: {
              promptTokens: 10,
              completionTokens: 5,
              totalTokens: 15,
            },
          },
        };

        const result = OracleChatCompleteResponseTransform(
          response,
          200,
          mockHeaders
        );

        expect(result).toMatchObject({
          object: 'chat.completion',
          model: 'meta.llama-3.1-70b-instruct',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello!',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        });
      });

      it('should transform response with tool calls', () => {
        const response = {
          modelId: 'meta.llama-3.1-70b-instruct',
          modelVersion: '1.0',
          chatResponse: {
            timeCreated: new Date(),
            apiFormat: 'GENERIC',
            choices: [
              {
                index: 0,
                message: {
                  role: 'ASSISTANT',
                  content: [],
                  toolCalls: [
                    {
                      id: 'call_123',
                      type: 'FUNCTION',
                      name: 'get_weather',
                      arguments: '{"location": "NYC"}',
                    },
                  ],
                },
                finishReason: 'tool_calls',
              },
            ],
            usage: {
              promptTokens: 20,
              completionTokens: 10,
              totalTokens: 30,
            },
          },
        };

        const result = OracleChatCompleteResponseTransform(
          response,
          200,
          mockHeaders
        ) as any;

        expect(result.choices[0].message.tool_calls).toEqual([
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "NYC"}',
            },
          },
        ]);
        expect(result.choices[0].finish_reason).toBe('tool_calls');
      });

      it('should stringify non-string tool arguments', () => {
        const response = {
          modelId: 'test-model',
          modelVersion: '1.0',
          chatResponse: {
            timeCreated: new Date(),
            apiFormat: 'GENERIC',
            choices: [
              {
                index: 0,
                message: {
                  role: 'ASSISTANT',
                  content: [],
                  toolCalls: [
                    {
                      id: 'call_456',
                      type: 'FUNCTION',
                      name: 'func',
                      arguments: { key: 'value' },
                    },
                  ],
                },
                finishReason: 'tool_calls',
              },
            ],
            usage: {},
          },
        };

        const result = OracleChatCompleteResponseTransform(
          response,
          200,
          mockHeaders
        ) as any;

        expect(result.choices[0].message.tool_calls[0].function.arguments).toBe(
          '{"key":"value"}'
        );
      });
    });

    describe('Error Response', () => {
      it('should transform error response', () => {
        const response = {
          code: '400',
          message: 'Invalid request',
        };

        const result = OracleChatCompleteResponseTransform(
          response,
          400,
          mockHeaders
        ) as any;

        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Invalid request');
        expect(result.error.code).toBe('400');
      });
    });
  });

  describe('OracleChatCompleteStreamChunkTransform', () => {
    let streamState: OracleStreamState;
    const fallbackId = 'test-id';
    const gatewayRequest: Params = { model: 'meta.llama-3.1-70b-instruct' };

    beforeEach(() => {
      streamState = initOracleStreamState();
    });

    describe('Ping Events', () => {
      it('should return undefined for ping events', () => {
        const result = OracleChatCompleteStreamChunkTransform(
          'event: ping',
          fallbackId,
          streamState,
          false,
          gatewayRequest
        );
        expect(result).toBeUndefined();
      });
    });

    describe('Done Events', () => {
      it('should return done message for [DONE]', () => {
        const result = OracleChatCompleteStreamChunkTransform(
          'data: [DONE]',
          fallbackId,
          streamState,
          false,
          gatewayRequest
        );
        expect(result).toBe('data: [DONE]\n\n');
      });
    });

    describe('Content Streaming', () => {
      it('should transform text content chunk', () => {
        const chunk = JSON.stringify({
          index: 0,
          message: {
            role: 'ASSISTANT',
            content: [{ type: 'TEXT', text: 'Hello' }],
          },
        });

        const result = OracleChatCompleteStreamChunkTransform(
          `data: ${chunk}`,
          fallbackId,
          streamState,
          false,
          gatewayRequest
        ) as string;

        const parsed = JSON.parse(result.replace('data: ', '').trim());
        expect(parsed.choices[0].delta.content).toBe('Hello');
        expect(parsed.choices[0].delta.role).toBe('assistant');
      });
    });

    describe('Tool Calls Streaming', () => {
      it('should transform tool calls in final chunk', () => {
        const chunk = JSON.stringify({
          index: 0,
          message: {
            role: 'ASSISTANT',
            content: [],
            toolCalls: [
              {
                id: 'call_stream_1',
                type: 'FUNCTION',
                name: 'get_weather',
                arguments: '{"loc": "NYC"}',
              },
            ],
          },
          finishReason: 'tool_calls',
        });

        const result = OracleChatCompleteStreamChunkTransform(
          `data: ${chunk}`,
          fallbackId,
          streamState,
          false,
          gatewayRequest
        ) as string[];

        // Should return array with tool call chunk, finish chunk, and done
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);

        // First chunk should have tool calls
        const toolCallChunk = JSON.parse(
          result[0].replace('data: ', '').trim()
        );
        expect(toolCallChunk.choices[0].delta.tool_calls).toEqual([
          {
            index: 0,
            id: 'call_stream_1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"loc": "NYC"}',
            },
          },
        ]);

        // Second chunk should have finish_reason
        const finishChunk = JSON.parse(result[1].replace('data: ', '').trim());
        expect(finishChunk.choices[0].finish_reason).toBe('tool_calls');

        // Third should be done
        expect(result[2]).toBe('data: [DONE]\n\n');
      });

      it('should track tool call indices across chunks', () => {
        // Simulate multiple tool calls
        const chunk1 = JSON.stringify({
          index: 0,
          message: {
            role: 'ASSISTANT',
            content: [],
            toolCalls: [
              { id: 'tc_1', type: 'FUNCTION', name: 'func1', arguments: '{}' },
            ],
          },
        });

        OracleChatCompleteStreamChunkTransform(
          `data: ${chunk1}`,
          fallbackId,
          streamState,
          false,
          gatewayRequest
        );

        expect(streamState.seenToolCallIds.has('tc_1')).toBe(true);
        expect(streamState.currentToolCallIndex).toBe(0);

        // Second chunk with different tool call
        const chunk2 = JSON.stringify({
          index: 0,
          message: {
            role: 'ASSISTANT',
            content: [],
            toolCalls: [
              { id: 'tc_2', type: 'FUNCTION', name: 'func2', arguments: '{}' },
            ],
          },
        });

        OracleChatCompleteStreamChunkTransform(
          `data: ${chunk2}`,
          fallbackId,
          streamState,
          false,
          gatewayRequest
        );

        expect(streamState.seenToolCallIds.has('tc_2')).toBe(true);
        expect(streamState.currentToolCallIndex).toBe(1);
      });
    });

    describe('Finish Reason', () => {
      it('should handle stop finish reason', () => {
        const chunk = JSON.stringify({
          index: 0,
          message: {
            role: 'ASSISTANT',
            content: [{ type: 'TEXT', text: '' }],
          },
          finishReason: 'stop',
        });

        const result = OracleChatCompleteStreamChunkTransform(
          `data: ${chunk}`,
          fallbackId,
          streamState,
          false,
          gatewayRequest
        ) as string[];

        expect(Array.isArray(result)).toBe(true);
        const finishChunk = JSON.parse(result[0].replace('data: ', '').trim());
        expect(finishChunk.choices[0].finish_reason).toBe('stop');
      });

      it('should track finish reason in stream state', () => {
        const chunk = JSON.stringify({
          index: 0,
          message: { role: 'ASSISTANT', content: [] },
          finishReason: 'length',
        });

        OracleChatCompleteStreamChunkTransform(
          `data: ${chunk}`,
          fallbackId,
          streamState,
          false,
          gatewayRequest
        );

        expect(streamState.finishReason).toBe('length');
      });
    });

    describe('Stream State Initialization', () => {
      it('should initialize stream state on first chunk if not done', () => {
        const uninitializedState = {} as OracleStreamState;
        const chunk = JSON.stringify({
          index: 0,
          message: {
            role: 'ASSISTANT',
            content: [{ type: 'TEXT', text: 'Hi' }],
          },
        });

        OracleChatCompleteStreamChunkTransform(
          `data: ${chunk}`,
          fallbackId,
          uninitializedState,
          false,
          gatewayRequest
        );

        expect(uninitializedState.currentToolCallIndex).toBe(-1);
        expect(uninitializedState.seenToolCallIds).toBeInstanceOf(Set);
      });
    });
  });
});
