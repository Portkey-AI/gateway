/**
 * Chat Completions → Responses API Response Transform
 *
 * Converts Chat Completions responses to Responses API format.
 *
 * Note: The Responses API natively supports `reasoning` output items as part
 * of its standard spec, so we always include them if thinking data is present.
 * This is different from Chat Completions where thinking requires
 * strictOpenAiCompliance=false since it's a non-standard extension.
 */

import {
  OpenAIResponse,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseOutputText,
  ResponseFunctionToolCall,
  ResponseOutputItemReasoning,
} from '../../types/modelResponses';
import { ChatCompletionResponse, ErrorResponse } from '../../providers/types';
import { randomUUID } from 'crypto';

// Finish reason to status mapping
const STATUS_MAP: Record<string, 'completed' | 'incomplete' | 'in_progress'> = {
  stop: 'completed',
  end_turn: 'completed',
  tool_calls: 'completed',
  function_call: 'completed',
  length: 'incomplete',
  max_tokens: 'incomplete',
  content_filter: 'completed',
};

/**
 * Default values for Responses API fields
 * These are used when the original request doesn't specify a value
 */
const RESPONSE_DEFAULTS = {
  truncation: 'disabled' as const,
  parallel_tool_calls: true,
  tool_choice: 'auto' as const,
  temperature: 1,
  top_p: 1,
  presence_penalty: 0,
  frequency_penalty: 0,
  top_logprobs: 0,
  store: false,
  background: false,
  service_tier: 'default',
};

/**
 * Transform Chat Completions response to Responses API format
 *
 * Handles:
 * - Standard text content → message output items
 * - Tool calls → function_call output items
 * - Thinking/reasoning from content_blocks → reasoning output items (always, since it's native to Responses API)
 *
 * @param response - The Chat Completions response from the provider
 * @param responseStatus - HTTP status code
 * @param provider - Provider name
 * @param originalRequest - Original Responses API request (optional, for echoing back config values)
 */
export function transformChatCompletionsToResponses(
  response: ChatCompletionResponse | ErrorResponse,
  responseStatus: number,
  provider: string,
  originalRequest?: any
): OpenAIResponse | ErrorResponse {
  // Pass through errors
  if ('error' in response) return response;
  if (responseStatus !== 200) {
    return {
      error: {
        message: 'Request failed',
        type: 'api_error',
        param: null,
        code: null,
      },
      provider,
    } as ErrorResponse;
  }

  const output: ResponseOutputItem[] = [];
  let overallStatus: 'completed' | 'incomplete' | 'in_progress' = 'completed';

  // Process choices
  for (const choice of response.choices || []) {
    const msg = choice.message as any;
    const status = STATUS_MAP[choice.finish_reason] || 'completed';
    if (status === 'incomplete') overallStatus = 'incomplete';

    // Handle reasoning/thinking from content_blocks
    // Providers like Anthropic, Google, OpenRouter expose thinking via content_blocks
    // The Responses API natively supports reasoning, so we always include it
    if (msg.content_blocks?.length) {
      for (const block of msg.content_blocks) {
        // Handle thinking blocks (Anthropic, OpenRouter format)
        if (block.thinking || block.type === 'thinking') {
          const thinkingText = block.thinking || block.text || '';
          output.push({
            id: `rs_${randomUUID()}`,
            type: 'reasoning',
            summary: [
              {
                type: 'summary_text',
                text: thinkingText,
              },
            ],
          } as ResponseOutputItemReasoning);
        }
      }
    }

    // Handle tool calls
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        if (tc.type === 'function') {
          output.push({
            id: `fc_${randomUUID()}`,
            type: 'function_call',
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
            status: 'completed',
          } as ResponseFunctionToolCall);
        }
      }
    }

    // Handle text content
    const content = msg.content;
    if (content != null) {
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((c: any) => c.text || '').join('')
            : String(content);

      // Only add message if there's actual text content
      if (text) {
        output.push({
          id: `msg_${randomUUID()}`,
          type: 'message',
          role: 'assistant',
          status,
          content: [
            {
              type: 'output_text',
              text,
              annotations: [],
              logprobs: [],
            } as ResponseOutputText,
          ],
        } as ResponseOutputMessage);
      }
    }
  }

  // Build usage
  const usage = response.usage;
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  const reasoningTokens =
    (usage as any)?.completion_tokens_details?.reasoning_tokens || 0;
  const cachedTokens =
    (usage as any)?.prompt_tokens_details?.cached_tokens || 0;

  const createdAt = response.created || Math.floor(Date.now() / 1000);

  // Extract values from original request, falling back to defaults
  const req = originalRequest || {};

  // Transform tools back to Responses API format if present in original request
  const tools = (req.tools || []).map((t: any) => ({
    type: t.type || 'function',
    name: t.name,
    description: t.description ?? null,
    parameters: t.parameters ?? null,
    strict: t.strict ?? null,
  }));

  // Transform text format if present
  const textFormat = req.text?.format
    ? { format: req.text.format }
    : { format: { type: 'text' as const } };

  return {
    id: response.id || `resp_${randomUUID()}`,
    object: 'response',
    created_at: createdAt,
    completed_at:
      overallStatus === 'completed' ? Math.floor(Date.now() / 1000) : null,
    status: overallStatus,
    incomplete_details:
      overallStatus === 'incomplete' ? { reason: 'max_output_tokens' } : null,
    model: response.model,
    previous_response_id: req.previous_response_id ?? null,
    instructions: req.instructions ?? null,
    output,
    error: null,
    tools,
    tool_choice: req.tool_choice ?? RESPONSE_DEFAULTS.tool_choice,
    truncation: req.truncation ?? RESPONSE_DEFAULTS.truncation,
    parallel_tool_calls:
      req.parallel_tool_calls ?? RESPONSE_DEFAULTS.parallel_tool_calls,
    text: textFormat,
    top_p: req.top_p ?? RESPONSE_DEFAULTS.top_p,
    presence_penalty:
      req.presence_penalty ?? RESPONSE_DEFAULTS.presence_penalty,
    frequency_penalty:
      req.frequency_penalty ?? RESPONSE_DEFAULTS.frequency_penalty,
    top_logprobs: req.top_logprobs ?? RESPONSE_DEFAULTS.top_logprobs,
    temperature: req.temperature ?? RESPONSE_DEFAULTS.temperature,
    reasoning: req.reasoning ?? null,
    usage: {
      input_tokens: inputTokens,
      input_tokens_details: { cached_tokens: cachedTokens },
      output_tokens: outputTokens,
      output_tokens_details: { reasoning_tokens: reasoningTokens },
      total_tokens: inputTokens + outputTokens,
    },
    max_output_tokens: req.max_output_tokens ?? null,
    max_tool_calls: req.max_tool_calls ?? null,
    store: req.store ?? RESPONSE_DEFAULTS.store,
    background: req.background ?? RESPONSE_DEFAULTS.background,
    service_tier: req.service_tier ?? RESPONSE_DEFAULTS.service_tier,
    metadata: req.metadata ?? {},
    safety_identifier: req.safety_identifier ?? null,
    prompt_cache_key: req.prompt_cache_key ?? null,
  } as OpenAIResponse;
}

/**
 * Create a response transformer function for a specific provider
 */
export function createResponsesAdapterTransformer(
  provider: string,
  originalRequest?: any
) {
  return (response: any, responseStatus: number) =>
    transformChatCompletionsToResponses(
      response,
      responseStatus,
      provider,
      originalRequest
    );
}

export default transformChatCompletionsToResponses;
