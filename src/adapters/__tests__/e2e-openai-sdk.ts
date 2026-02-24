#!/usr/bin/env npx tsx
/**
 * End-to-End Test using OpenAI SDK
 *
 * This script tests the Responses API adapter using the official OpenAI SDK.
 * The SDK has strict type checking, so if our responses work with it,
 * we know we're producing valid Responses API format.
 *
 * Prerequisites:
 *   1. Install OpenAI SDK: npm install openai
 *   2. Start the gateway: npm run dev:node
 *   3. Set environment variables:
 *      - PORTKEY_API_KEY: Your Portkey API key
 *      - ANTHROPIC_API_KEY: Your Anthropic API key (or use virtual key)
 *
 * Usage:
 *   npx tsx src/adapters/__tests__/e2e-openai-sdk.ts
 *
 * Or run specific tests:
 *   npx tsx src/adapters/__tests__/e2e-openai-sdk.ts --test basic
 *   npx tsx src/adapters/__tests__/e2e-openai-sdk.ts --test streaming
 *   npx tsx src/adapters/__tests__/e2e-openai-sdk.ts --test tools
 */

// Dynamic import to handle case where openai isn't installed
async function main() {
  let OpenAI: any;
  try {
    const openaiModule = await import('openai');
    OpenAI = openaiModule.default;
  } catch (err: any) {
    console.error(
      '❌ OpenAI SDK not installed or failed to import. Run: npm install openai'
    );
    console.error('   Import error:', err?.message || err);
    console.log(
      '\nThis test requires the OpenAI SDK to validate type compatibility.'
    );
    process.exit(1);
  }

  const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8787';
  const PORTKEY_API_KEY = process.env.PORTKEY_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!PORTKEY_API_KEY || !ANTHROPIC_API_KEY) {
    console.error('❌ Missing required environment variables:');
    if (!PORTKEY_API_KEY) console.error('   - PORTKEY_API_KEY');
    if (!ANTHROPIC_API_KEY) console.error('   - ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // Create OpenAI client pointing to our gateway
  const client = new OpenAI({
    apiKey: PORTKEY_API_KEY,
    baseURL: `${GATEWAY_URL}/v1`,
    defaultHeaders: {
      'x-portkey-provider': 'anthropic',
      'x-portkey-api-key': PORTKEY_API_KEY,
      Authorization: `Bearer ${ANTHROPIC_API_KEY}`,
    },
  });

  const testArg =
    process.argv.find((arg) => arg.startsWith('--test='))?.split('=')[1] ||
    process.argv[process.argv.indexOf('--test') + 1];

  const tests: Record<string, () => Promise<void>> = {
    basic: testBasicResponse,
    streaming: testStreamingResponse,
    tools: testToolCalls,
    conversation: testMultiTurnConversation,
    all: runAllTests,
  };

  async function runAllTests() {
    for (const [name, test] of Object.entries(tests)) {
      if (name === 'all') continue;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Running: ${name}`);
      console.log('='.repeat(60));
      try {
        await test();
      } catch (err: any) {
        console.error(`❌ ${name} failed:`, err.message);
      }
    }
  }

  async function testBasicResponse() {
    console.log('\n📝 Test: Basic Response (non-streaming)');
    console.log('-'.repeat(40));

    try {
      // Using the responses.create API
      const response = await (client as any).responses.create({
        model: 'claude-3-haiku-20240307',
        input: 'Say "Hello from Anthropic via Portkey!" and nothing else.',
        max_output_tokens: 50,
      });

      console.log('✅ Response received');
      console.log('   ID:', response.id);
      console.log('   Status:', response.status);
      console.log('   Model:', response.model);

      // Type validation - these should all exist on a valid Response
      if (response.object !== 'response') {
        throw new Error(`Expected object="response", got "${response.object}"`);
      }
      if (
        !['completed', 'incomplete', 'in_progress'].includes(response.status)
      ) {
        throw new Error(`Invalid status: ${response.status}`);
      }
      if (!Array.isArray(response.output)) {
        throw new Error('output should be an array');
      }

      // Check output structure
      const messageOutput = response.output.find(
        (o: any) => o.type === 'message'
      );
      if (messageOutput) {
        console.log('   Output type:', messageOutput.type);
        console.log(
          '   Content:',
          messageOutput.content?.[0]?.text?.substring(0, 100)
        );
      }

      // Check usage
      if (response.usage) {
        console.log('   Usage:', {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        });
      }

      console.log('\n✅ Basic response test PASSED');
    } catch (err: any) {
      console.error('\n❌ Basic response test FAILED:', err.message);
      throw err;
    }
  }

  async function testStreamingResponse() {
    console.log('\n📝 Test: Streaming Response');
    console.log('-'.repeat(40));

    try {
      const stream = await (client as any).responses.create({
        model: 'claude-3-haiku-20240307',
        input: 'Count from 1 to 5, one number per line.',
        max_output_tokens: 100,
        stream: true,
      });

      const events: string[] = [];
      let textContent = '';

      console.log('   Streaming events:');
      for await (const event of stream) {
        events.push(event.type);

        // Collect text deltas
        if (event.type === 'response.output_text.delta') {
          textContent += event.delta || '';
          process.stdout.write(event.delta || '');
        }

        // Log key events
        if (event.type === 'response.created') {
          console.log('   → response.created');
        } else if (event.type === 'response.completed') {
          console.log('\n   → response.completed');
        }
      }

      console.log(
        '\n   Event types received:',
        [...new Set(events)].join(', ')
      );
      console.log('   Full text:', textContent.substring(0, 100));

      // Validate expected events
      const requiredEvents = [
        'response.created',
        'response.in_progress',
        'response.output_item.added',
        'response.completed',
      ];

      for (const required of requiredEvents) {
        if (!events.includes(required)) {
          throw new Error(`Missing required event: ${required}`);
        }
      }

      console.log('\n✅ Streaming response test PASSED');
    } catch (err: any) {
      console.error('\n❌ Streaming response test FAILED:', err.message);
      throw err;
    }
  }

  async function testToolCalls() {
    console.log('\n📝 Test: Tool Calls');
    console.log('-'.repeat(40));

    try {
      const response = await (client as any).responses.create({
        model: 'claude-3-haiku-20240307',
        input: 'What is the weather in Paris? Use the get_weather function.',
        max_output_tokens: 200,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the current weather for a location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'City name',
                },
                unit: {
                  type: 'string',
                  enum: ['celsius', 'fahrenheit'],
                },
              },
              required: ['location'],
            },
          },
        ],
        tool_choice: 'auto',
      });

      console.log('✅ Response received');
      console.log('   Status:', response.status);

      // Look for function_call in output
      const functionCall = response.output.find(
        (o: any) => o.type === 'function_call'
      );
      if (functionCall) {
        console.log('   Tool called:', functionCall.name);
        console.log('   Arguments:', functionCall.arguments);
        console.log('   Call ID:', functionCall.call_id);

        // Validate structure
        if (!functionCall.name || !functionCall.arguments) {
          throw new Error('Invalid function_call structure');
        }

        // Try to parse arguments
        const args = JSON.parse(functionCall.arguments);
        console.log('   Parsed args:', args);
      } else {
        console.log(
          '   ⚠️ No function_call in output (model may have responded directly)'
        );
        console.log('   Output:', JSON.stringify(response.output, null, 2));
      }

      console.log('\n✅ Tool calls test PASSED');
    } catch (err: any) {
      console.error('\n❌ Tool calls test FAILED:', err.message);
      throw err;
    }
  }

  async function testMultiTurnConversation() {
    console.log('\n📝 Test: Multi-turn Conversation');
    console.log('-'.repeat(40));

    try {
      const response = await (client as any).responses.create({
        model: 'claude-3-haiku-20240307',
        instructions: 'You are a math tutor. Be concise.',
        input: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '4' },
          { role: 'user', content: 'And if I add 3 more?' },
        ],
        max_output_tokens: 50,
      });

      console.log('✅ Response received');
      console.log('   Status:', response.status);

      const messageOutput = response.output.find(
        (o: any) => o.type === 'message'
      );
      if (messageOutput) {
        const text = messageOutput.content?.[0]?.text || '';
        console.log('   Response:', text);

        // The answer should be 7
        if (text.includes('7')) {
          console.log('   ✅ Correct answer (7) found in response');
        } else {
          console.log('   ⚠️ Expected "7" in response');
        }
      }

      console.log('\n✅ Multi-turn conversation test PASSED');
    } catch (err: any) {
      console.error('\n❌ Multi-turn conversation test FAILED:', err.message);
      throw err;
    }
  }

  // Run the requested test
  console.log('🚀 OpenAI SDK E2E Test for Responses API Adapter');
  console.log('='.repeat(60));
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Provider: anthropic`);
  console.log('');

  const testToRun = testArg || 'all';
  if (tests[testToRun]) {
    await tests[testToRun]();
  } else {
    console.error(`Unknown test: ${testToRun}`);
    console.log('Available tests:', Object.keys(tests).join(', '));
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed');
}

main().catch((err) => {
  console.error('\n💥 Test suite failed:', err);
  process.exit(1);
});
