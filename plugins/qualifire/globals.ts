import { post } from '../utils';

export const BASE_URL = 'https://proxy.qualifire.ai/api/evaluation/evaluate';

interface AvailableTool {
  name: string;
  description: string;
  parameters: object;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

interface Message {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export const postQualifire = async (
  body: any,
  qualifireApiKey?: string,
  timeout_millis?: number
) => {
  if (!qualifireApiKey) {
    throw new Error('Qualifire API key is required');
  }

  const options = {
    headers: {
      'X-Qualifire-API-Key': `${qualifireApiKey}`,
    },
  };

  const result = await post(BASE_URL, body, options, timeout_millis || 60000);
  const error = result?.error || null;
  const verdict = result?.status === 'success';
  const data = result?.evaluationResults;

  return { error, verdict, data };
};

export const parseAvailableTools = (
  request: any
): AvailableTool[] | undefined => {
  const tools = request?.json?.tools ?? [];
  const functionTools = tools.filter((tool: any) => tool.type === 'function');

  if (functionTools.length === 0) {
    return undefined;
  }

  return functionTools.map((tool: any) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
};

const convertContent = (content: any) => {
  if (!content) {
    return '';
  } else if (typeof content === 'string') {
    return content;
  } else if (!Array.isArray(content)) {
    return JSON.stringify(content); // unexpected format, pass as raw
  }

  return content
    .map((part: any) => {
      if (part.type === 'text') {
        return part.text;
      }
      return '\n' + JSON.stringify(part) + '\n';
    })
    .join('');
};

const convertToolCalls = (toolCalls: any) => {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined;
  }

  toolCalls = toolCalls.filter((toolCall: any) => toolCall.type === 'function');
  if (toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls.map((toolCall: any) => {
    const rawArgs = toolCall.function?.arguments ?? '{}';
    let parsedArgs: any = rawArgs;
    try {
      parsedArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      // leave as-is
    }
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: parsedArgs,
    };
  });
};

export const convertToMessages = (
  request: any,
  response: any,
  ignoreRequestHistory: boolean = true
): Message[] => {
  let messages = request.json.messages;

  if (ignoreRequestHistory) {
    messages = [messages[messages.length - 1]];
  }

  // convert request
  const requestMessages = messages.map((message: any) => {
    const role = message.role;
    const content = convertContent(message.content);

    return {
      role: role,
      content: content,
      tool_calls: convertToolCalls(message.tool_calls) ?? undefined,
      tool_call_id: message.tool_call_id ?? undefined,
    };
  });

  // convert response if given
  if ((response?.json?.choices || []).length === 0) {
    return requestMessages;
  }
  if (!response.json.choices[0].message) {
    return requestMessages;
  }

  const responseMessage = response.json.choices[0].message;

  const convertedResponseMessage = {
    role: responseMessage.role,
    content: convertContent(responseMessage.content),
    tool_calls: convertToolCalls(responseMessage.tool_calls),
  };

  return [...requestMessages, convertedResponseMessage];
};
