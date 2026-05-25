import { PluginContext, PluginParameters } from '../types';
import { post } from '../utils';

export const promptSecurityProtectApi = async (credentials: any, data: any) => {
  const headers = {
    'APP-ID': credentials.apiKey,
    'Content-Type': 'application/json',
  };
  const url = `https://${credentials.apiDomain}/api/protect`;
  return post(url, data, { headers });
};

export const getSystemPrompt = (context: PluginContext): string | undefined => {
  const messages = context.request?.json?.messages;
  if (!Array.isArray(messages)) return undefined;
  const systemMessages = messages.filter(
    (message: any) => message.role === 'system'
  );
  if (systemMessages.length === 0) return undefined;
  return systemMessages
    .map((message: any) =>
      Array.isArray(message.content)
        ? message.content.map((item: any) => item.text || '').join('\n')
        : message.content
    )
    .join('\n');
};

export const buildProtectPayload = (
  text: string,
  target: 'prompt' | 'response',
  context: PluginContext,
  parameters: PluginParameters
): Record<string, any> => {
  const payload: Record<string, any> = { [target]: text };

  const systemPrompt = getSystemPrompt(context);
  if (systemPrompt) payload.system_prompt = systemPrompt;
  if (parameters.policy) payload.policy = parameters.policy;
  if (parameters.user) payload.user = parameters.user;
  else if (context.metadata?.user) payload.user = context.metadata.user;
  if (parameters.userGroups) payload.user_groups = parameters.userGroups;
  if (parameters.monitorOnly !== undefined)
    payload.monitor_only = parameters.monitorOnly;

  return payload;
};
