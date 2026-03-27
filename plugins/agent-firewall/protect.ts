import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  // If no violations, we pass (verdict = true)
  // If we find an attack, verdict = false
  let verdict = true;
  let data = null;

  if (eventType !== 'afterRequestHook') {
    return { error, verdict, data };
  }

  try {
    const responseJson = context.response?.json;
    if (!responseJson?.choices?.length) {
      return { error, verdict, data };
    }

    const message = responseJson.choices[0]?.message;
    if (!message?.tool_calls?.length) {
      return { error, verdict, data };
    }

    // Agent-First Zero-Trust Intent rules
    const dangerousPatterns = [
      /rm\s+-rf/i,
      /DROP\s+TABLE/i,
      /ALTER\s+TABLE/i,
      /DELETE\s+FROM/i,
      /\/etc\/passwd/i,
      /chmod\s+-R/i,
      /chown\s+-R/i,
      />\s*\/dev\/sd[a-z]/i,
      /mkfs/i,
      /wget\s+.*\|.*sh/i,
      /curl\s+.*\|.*sh/i,
    ];

    for (const tool of message.tool_calls) {
      if (tool.function?.arguments) {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(tool.function.arguments)) {
            verdict = false; // Trigger Block
            data = {
              verdict: false,
              explanation: `[GATEWAY SECURITY BLOCK] Malicious agent intent detected. Blocked pattern: ${pattern.toString()} in tool '${tool.function.name}'`,
              tool_name: tool.function.name,
              arguments: tool.function.arguments,
            };
            return { error, verdict, data };
          }
        }
      }
    }

    data = {
      explanation: 'All tool_calls successfully passed Agent Firewall.',
    };
  } catch (e: any) {
    error = e;
  }

  return { error, verdict, data };
};
