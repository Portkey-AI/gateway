import { PluginContext, PluginHandler, PluginParameters } from '../types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: string
) => {
  if (eventType !== 'afterRequest') {
    return { verdict: true, data: null };
  }

  const responseText = extractResponseText(context);
  if (!responseText || responseText.trim().length === 0) {
    return { verdict: true, data: null };
  }

  const apiKey = context.credentials?.apiKey;
  const baseUrl = context.credentials?.baseUrl || 'https://hidylan.ai';
  const sensitivity = parameters?.sensitivity || 'standard';

  if (!apiKey) {
    console.error('[mlayer-guard] No API key provided. Skipping injection check.');
    return { verdict: true, data: null };
  }

  try {
    const response = await fetch(`${baseUrl}/v1/injection-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Source': 'portkey-plugin',
      },
      body: JSON.stringify({
        system_prompt: extractSystemPrompt(context),
        retrieved_docs: [
          {
            doc_id: 'llm_response',
            content: responseText,
            source: 'llm_output',
            trust_tier: 'untrusted',
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        `[mlayer-guard] API returned ${response.status}. Allowing request through.`
      );
      return { verdict: true, data: null };
    }

    const result = await response.json();

    if (result.status === 'blocked') {
      return {
        verdict: false,
        error: `Prompt injection detected: ${result.explanation || 'Content blocked by mlayer-guard'}`,
        data: {
          status: result.status,
          explanation: result.explanation,
          blocked_doc_ids: result.blocked_doc_ids,
          detection_ms: result.detection_ms,
        },
      };
    }

    if (result.status === 'abstain' && sensitivity === 'strict') {
      return {
        verdict: false,
        error: `Inconclusive injection check (strict mode): ${result.explanation || 'Content flagged as ambiguous by mlayer-guard'}`,
        data: {
          status: result.status,
          explanation: result.explanation,
          detection_ms: result.detection_ms,
        },
      };
    }

    return {
      verdict: true,
      data: {
        status: result.status,
        detection_ms: result.detection_ms,
      },
    };
  } catch (error) {
    console.error('[mlayer-guard] Detection request failed:', error);
    return { verdict: true, data: null };
  }
};

function extractResponseText(context: PluginContext): string {
  try {
    const response = context.response;

    if (response?.body?.choices?.[0]?.message?.content) {
      return response.body.choices[0].message.content;
    }

    if (response?.body?.choices?.[0]?.message?.tool_calls) {
      const toolCalls = response.body.choices[0].message.tool_calls;
      return toolCalls
        .map((tc: any) => tc.function?.arguments || '')
        .filter(Boolean)
        .join('\n');
    }

    if (response?.body) {
      return typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body);
    }

    return '';
  } catch {
    return '';
  }
}

function extractSystemPrompt(context: PluginContext): string {
  try {
    const messages = context.request?.body?.messages;
    if (Array.isArray(messages)) {
      const systemMsg = messages.find((m: any) => m.role === 'system');
      if (systemMsg?.content) {
        return typeof systemMsg.content === 'string'
          ? systemMsg.content
          : JSON.stringify(systemMsg.content);
      }
    }
  } catch {
    // ignore
  }
  return 'You are a helpful assistant.';
}
