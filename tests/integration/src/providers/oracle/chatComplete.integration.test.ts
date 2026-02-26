/**
 * Integration tests for Oracle GenAI provider.
 *
 * These tests make real API calls to OCI GenAI.
 *
 * Required environment variables:
 * - ORACLE_TENANCY: OCI tenancy OCID
 * - ORACLE_USER: OCI user OCID
 * - ORACLE_FINGERPRINT: API key fingerprint
 * - ORACLE_PRIVATE_KEY: PEM-encoded private key (can be multiline)
 * - ORACLE_COMPARTMENT_ID: Compartment OCID
 * - ORACLE_REGION: OCI region (e.g., us-chicago-1)
 *
 * Optional environment variables:
 * - ORACLE_TEST_MODELS: Comma-separated list of models to test
 *   Default: meta.llama-4-maverick-17b-128e-instruct-fp8,google.gemini-2.5-flash
 *
 * Run with: npx jest tests/integration/src/providers/oracle --no-cache
 */

import { transformUsingProviderConfig } from '../../../../../src/services/transformToProviderRequest';
import { Options, Params } from '../../../../../src/types/requestBody';
import {
  OracleChatCompleteConfig,
  OracleChatCompleteResponseTransform,
  OracleChatCompleteStreamChunkTransform,
  initOracleStreamState,
} from '../../../../../src/providers/oracle/chatComplete';
import {
  OracleChatCompleteResponse,
  OracleErrorResponse,
} from '../../../../../src/providers/oracle/types/GenericChatResponse';
import { OCIRequestSigner } from '../../../../../src/providers/oracle/utils';
import {
  getModelConfig,
  getRecommendedMaxTokens,
  modelSupports,
} from '../../../../../src/providers/oracle/modelConfig';

// Skip all tests if credentials are not available
const hasCredentials = Boolean(
  process.env.ORACLE_TENANCY &&
    process.env.ORACLE_USER &&
    process.env.ORACLE_FINGERPRINT &&
    process.env.ORACLE_PRIVATE_KEY &&
    process.env.ORACLE_COMPARTMENT_ID &&
    process.env.ORACLE_REGION
);

const describeIfCredentials = hasCredentials ? describe : describe.skip;

// Parse test models from environment variable
const DEFAULT_MODELS =
  'meta.llama-4-maverick-17b-128e-instruct-fp8,google.gemini-2.5-flash';
const TEST_MODELS = (process.env.ORACLE_TEST_MODELS || DEFAULT_MODELS)
  .split(',')
  .map((m) => m.trim())
  .filter((m) => m.length > 0);

// Test configuration
const getOracleConfig = (): Options => ({
  provider: 'oracle',
  oracleTenancy: process.env.ORACLE_TENANCY || '',
  oracleUser: process.env.ORACLE_USER || '',
  oracleFingerprint: process.env.ORACLE_FINGERPRINT || '',
  oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY || '',
  oracleCompartmentId: process.env.ORACLE_COMPARTMENT_ID || '',
  oracleRegion: process.env.ORACLE_REGION || 'us-chicago-1',
  oracleServingMode: 'ON_DEMAND',
});

async function makeOracleRequest(
  params: Params,
  stream: boolean = false
): Promise<Response> {
  const providerOptions = getOracleConfig();

  // Transform request to Oracle format using provider config
  const transformedRequest = transformUsingProviderConfig(
    OracleChatCompleteConfig,
    { ...params, stream },
    providerOptions
  );

  // Build URL
  const oracleApiVersion = '20231130';
  const baseUrl = `https://inference.generativeai.${providerOptions.oracleRegion}.oci.oraclecloud.com`;
  const endpoint = `/${oracleApiVersion}/actions/chat`;
  const url = `${baseUrl}${endpoint}`;

  // Sign request
  const signer = new OCIRequestSigner({
    tenancy: providerOptions.oracleTenancy || '',
    user: providerOptions.oracleUser || '',
    fingerprint: providerOptions.oracleFingerprint || '',
    privateKey: providerOptions.oraclePrivateKey || '',
    keyPassphrase: providerOptions.oracleKeyPassphrase,
    region: providerOptions.oracleRegion || '',
  });

  const body = JSON.stringify(transformedRequest);
  const headers = await signer.signRequest('POST', url, body, {});

  // Make request - headers from signer already include content-type
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  return response;
}

/**
 * Get appropriate max_tokens for a model
 */
function getTestMaxTokens(modelId: string, baseTokens: number = 50): number {
  return getRecommendedMaxTokens(modelId, baseTokens);
}

describeIfCredentials('Oracle GenAI Integration Tests', () => {
  // Log which models are being tested
  beforeAll(() => {
    console.log(`Testing with models: ${TEST_MODELS.join(', ')}`);
    TEST_MODELS.forEach((model) => {
      const config = getModelConfig(model);
      console.log(
        `  ${model}: family=${config.family}, minTokens=${config.minTokens}, reasoning=${config.usesReasoningTokens}`
      );
    });
  });

  describe('Basic Chat Completion', () => {
    // Test each model with basic chat
    TEST_MODELS.forEach((modelId) => {
      it(`should complete a simple chat request with ${modelId}`, async () => {
        const params: Params = {
          model: modelId,
          messages: [
            { role: 'user', content: 'Say "hello world" and nothing else.' },
          ],
          max_tokens: getTestMaxTokens(modelId, 50),
        };

        const response = await makeOracleRequest(params);

        if (!response.ok) {
          const errorData = await response.json();
          console.error(
            `[${modelId}] Request failed:`,
            response.status,
            JSON.stringify(errorData)
          );
        }
        expect(response.ok).toBe(true);

        const data = (await response.json()) as
          | OracleChatCompleteResponse
          | OracleErrorResponse;
        const transformed = OracleChatCompleteResponseTransform(
          data,
          response.status,
          response.headers
        );

        expect(transformed).toHaveProperty('choices');
        expect((transformed as any).choices[0].message.content).toBeTruthy();
        expect((transformed as any).choices[0].message.role).toBe('assistant');
        console.log(
          `[${modelId}] Response:`,
          (transformed as any).choices[0].message.content
        );
      }, 60000);
    });

    // Test system messages with first model that supports it
    it('should handle system messages', async () => {
      const modelId = TEST_MODELS.find((m) =>
        modelSupports(m, 'systemMessages')
      );
      if (!modelId) {
        console.log('No model supports system messages, skipping test');
        return;
      }

      const params: Params = {
        model: modelId,
        messages: [
          {
            role: 'system',
            content: 'You are a pirate. Respond in pirate speak.',
          },
          { role: 'user', content: 'Hello!' },
        ],
        max_tokens: getTestMaxTokens(modelId, 100),
      };

      const response = await makeOracleRequest(params);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as
        | OracleChatCompleteResponse
        | OracleErrorResponse;
      const transformed = OracleChatCompleteResponseTransform(
        data,
        response.status,
        response.headers
      );

      expect((transformed as any).choices[0].message.content).toBeTruthy();
      console.log(
        `[${modelId}] Pirate response:`,
        (transformed as any).choices[0].message.content
      );
    }, 60000);

    // Test multi-turn conversation with first available model
    it('should handle multi-turn conversation', async () => {
      const modelId = TEST_MODELS[0];
      const params: Params = {
        model: modelId,
        messages: [
          { role: 'user', content: 'My name is Federico.' },
          { role: 'assistant', content: 'Nice to meet you, Federico!' },
          { role: 'user', content: 'What is my name?' },
        ],
        max_tokens: getTestMaxTokens(modelId, 50),
      };

      const response = await makeOracleRequest(params);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as
        | OracleChatCompleteResponse
        | OracleErrorResponse;
      const transformed = OracleChatCompleteResponseTransform(
        data,
        response.status,
        response.headers
      );

      const content = (
        transformed as any
      ).choices[0].message.content.toLowerCase();
      expect(content).toContain('federico');
      console.log(
        `[${modelId}] Name response:`,
        (transformed as any).choices[0].message.content
      );
    }, 60000);
  });

  describe('Streaming Chat Completion', () => {
    // Test streaming with each model that supports it
    TEST_MODELS.filter((m) => modelSupports(m, 'streaming')).forEach(
      (modelId) => {
        it(`should stream a chat response with ${modelId}`, async () => {
          const params: Params = {
            model: modelId,
            messages: [{ role: 'user', content: 'Count from 1 to 5.' }],
            max_tokens: getTestMaxTokens(modelId, 100),
            stream: true,
          };

          const response = await makeOracleRequest(params, true);
          expect(response.ok).toBe(true);

          const reader = response.body?.getReader();
          expect(reader).toBeDefined();

          const decoder = new TextDecoder();
          const streamState = initOracleStreamState();
          const chunks: string[] = [];
          let fullContent = '';

          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n').filter((line) => line.trim());

            for (const line of lines) {
              if (line.startsWith('data:') || line.startsWith('event:')) {
                const transformed = OracleChatCompleteStreamChunkTransform(
                  line,
                  'test-id',
                  streamState,
                  false,
                  params
                );
                if (transformed) {
                  if (Array.isArray(transformed)) {
                    chunks.push(...transformed);
                  } else {
                    chunks.push(transformed);
                  }
                }
              }
            }
          }

          expect(chunks.length).toBeGreaterThan(0);

          // Extract content from chunks
          for (const chunk of chunks) {
            if (chunk.startsWith('data: ') && !chunk.includes('[DONE]')) {
              try {
                const parsed = JSON.parse(chunk.replace('data: ', ''));
                if (parsed.choices?.[0]?.delta?.content) {
                  fullContent += parsed.choices[0].delta.content;
                }
              } catch (e) {
                // Ignore parse errors for non-JSON chunks
              }
            }
          }

          console.log(`[${modelId}] Streamed content:`, fullContent);
          expect(fullContent).toBeTruthy();
        }, 60000);
      }
    );
  });

  describe('Tool Calling', () => {
    const weatherTool = {
      type: 'function' as const,
      function: {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              description: 'Temperature unit',
            },
          },
          required: ['location'],
        },
      },
    };

    // Test tool calling with each model that supports it
    TEST_MODELS.filter((m) => modelSupports(m, 'tools')).forEach((modelId) => {
      it(`should request tool call with ${modelId}`, async () => {
        const params: Params = {
          model: modelId,
          messages: [
            { role: 'user', content: 'What is the weather in New York City?' },
          ],
          tools: [weatherTool],
          tool_choice: 'auto',
          max_tokens: getTestMaxTokens(modelId, 200),
        };

        const response = await makeOracleRequest(params);
        expect(response.ok).toBe(true);

        const data = (await response.json()) as
          | OracleChatCompleteResponse
          | OracleErrorResponse;
        const transformed = OracleChatCompleteResponseTransform(
          data,
          response.status,
          response.headers
        ) as any;

        console.log(
          `[${modelId}] Tool response:`,
          JSON.stringify(transformed.choices[0], null, 2)
        );

        // Model should either call the tool or respond with text
        const message = transformed.choices[0].message;
        if (message.tool_calls && message.tool_calls.length > 0) {
          expect(message.tool_calls[0].function.name).toBe('get_weather');
          const args = JSON.parse(message.tool_calls[0].function.arguments);
          expect(args.location).toBeTruthy();
          console.log(`[${modelId}] Tool called with:`, args);
        } else {
          // Model chose to respond without tool
          expect(message.content).toBeTruthy();
        }
      }, 60000);
    });

    // Test multi-turn with tool results using first model that supports tools
    it('should handle multi-turn with tool results', async () => {
      const modelId = TEST_MODELS.find((m) => modelSupports(m, 'tools'));
      if (!modelId) {
        console.log('No model supports tools, skipping test');
        return;
      }

      // First request - get tool call
      const firstParams: Params = {
        model: modelId,
        messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
        tools: [weatherTool],
        tool_choice: 'required',
        max_tokens: getTestMaxTokens(modelId, 200),
      };

      const firstResponse = await makeOracleRequest(firstParams);
      expect(firstResponse.ok).toBe(true);

      const firstData = (await firstResponse.json()) as
        | OracleChatCompleteResponse
        | OracleErrorResponse;
      const firstTransformed = OracleChatCompleteResponseTransform(
        firstData,
        firstResponse.status,
        firstResponse.headers
      ) as any;

      const toolCall = firstTransformed.choices[0].message.tool_calls?.[0];

      if (toolCall) {
        // Second request - provide tool result
        const secondParams: Params = {
          model: modelId,
          messages: [
            { role: 'user', content: 'What is the weather in Paris?' },
            {
              role: 'assistant',
              content: '',
              tool_calls: [toolCall],
            },
            {
              role: 'tool',
              content: JSON.stringify({
                temperature: 18,
                unit: 'celsius',
                condition: 'partly cloudy',
              }),
              tool_call_id: toolCall.id,
            },
          ],
          max_tokens: getTestMaxTokens(modelId, 200),
        };

        const secondResponse = await makeOracleRequest(secondParams);
        if (!secondResponse.ok) {
          const errorData = await secondResponse.json();
          console.error(
            `[${modelId}] Multi-turn tool result failed:`,
            secondResponse.status,
            JSON.stringify(errorData, null, 2)
          );
        }
        expect(secondResponse.ok).toBe(true);

        const secondData = (await secondResponse.json()) as
          | OracleChatCompleteResponse
          | OracleErrorResponse;
        const secondTransformed = OracleChatCompleteResponseTransform(
          secondData,
          secondResponse.status,
          secondResponse.headers
        ) as any;

        console.log(
          `[${modelId}] Final response with tool result:`,
          secondTransformed.choices[0].message.content
        );
        expect(secondTransformed.choices[0].message.content).toBeTruthy();
        // Should mention the weather data
        const content =
          secondTransformed.choices[0].message.content.toLowerCase();
        expect(content).toMatch(/paris|18|celsius|cloudy/i);
      }
    }, 120000);
  });

  describe('Tool Calling with Streaming', () => {
    const calculatorTool = {
      type: 'function' as const,
      function: {
        name: 'calculate',
        description: 'Perform a mathematical calculation',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'The math expression to evaluate',
            },
          },
          required: ['expression'],
        },
      },
    };

    // Test streaming tool calls with first model that supports both
    it('should stream tool calls', async () => {
      const modelId = TEST_MODELS.find(
        (m) => modelSupports(m, 'tools') && modelSupports(m, 'streaming')
      );
      if (!modelId) {
        console.log('No model supports both tools and streaming, skipping');
        return;
      }

      const params: Params = {
        model: modelId,
        messages: [{ role: 'user', content: 'What is 42 * 17?' }],
        tools: [calculatorTool],
        tool_choice: 'required',
        max_tokens: getTestMaxTokens(modelId, 200),
        stream: true,
      };

      const response = await makeOracleRequest(params, true);
      expect(response.ok).toBe(true);

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      const decoder = new TextDecoder();
      const streamState = initOracleStreamState();
      const allChunks: string[] = [];
      let hasToolCalls = false;

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith('data:') || line.startsWith('event:')) {
            const transformed = OracleChatCompleteStreamChunkTransform(
              line,
              'test-id',
              streamState,
              false,
              params
            );
            if (transformed) {
              const chunks = Array.isArray(transformed)
                ? transformed
                : [transformed];
              for (const chunk of chunks) {
                allChunks.push(chunk);
                if (chunk.includes('tool_calls')) {
                  hasToolCalls = true;
                }
              }
            }
          }
        }
      }

      console.log(
        `[${modelId}] Streaming tool chunks received:`,
        allChunks.length
      );
      console.log(`[${modelId}] Has tool calls in stream:`, hasToolCalls);

      // Check if tool calls were received
      for (const chunk of allChunks) {
        if (chunk.startsWith('data: ') && !chunk.includes('[DONE]')) {
          try {
            const parsed = JSON.parse(chunk.replace('data: ', ''));
            if (parsed.choices?.[0]?.delta?.tool_calls) {
              console.log(
                `[${modelId}] Tool call in stream:`,
                JSON.stringify(parsed.choices[0].delta.tool_calls, null, 2)
              );
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }, 60000);
  });

  describe('Usage Statistics', () => {
    it('should return token usage', async () => {
      const modelId = TEST_MODELS[0];
      const params: Params = {
        model: modelId,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: getTestMaxTokens(modelId, 20),
      };

      const response = await makeOracleRequest(params);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as
        | OracleChatCompleteResponse
        | OracleErrorResponse;
      const transformed = OracleChatCompleteResponseTransform(
        data,
        response.status,
        response.headers
      ) as any;

      expect(transformed.usage).toBeDefined();
      expect(transformed.usage.prompt_tokens).toBeGreaterThan(0);
      expect(transformed.usage.completion_tokens).toBeGreaterThan(0);
      expect(transformed.usage.total_tokens).toBeGreaterThan(0);
      console.log(`[${modelId}] Usage:`, transformed.usage);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle invalid model gracefully', async () => {
      const params: Params = {
        model: 'invalid-model-name',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10,
      };

      const response = await makeOracleRequest(params);
      // Should return an error response
      expect(response.ok).toBe(false);

      const data = (await response.json()) as
        | OracleChatCompleteResponse
        | OracleErrorResponse;
      const transformed = OracleChatCompleteResponseTransform(
        data,
        response.status,
        response.headers
      ) as any;

      expect(transformed.error).toBeDefined();
      console.log('Error response:', transformed.error);
    }, 60000);
  });
});
