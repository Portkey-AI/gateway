import { Message } from '../../src/types/requestBody';
import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post } from '../utils';

export const LASSO_BASE_URL = 'https://server.lasso.security';

interface LassoMessage {
  role: string;
  content: string;
}

interface LassoClassifyRequest {
  messages: LassoMessage[];
}

interface LassoClassifyResponse {
  deputies: Record<string, boolean>;
  deputies_predictions: Record<string, number>;
  violations_detected: boolean;
}

export const classify = async (
  credentials: Record<string, any>,
  data: LassoClassifyRequest,
  conversationId?: string,
  userId?: string,
  timeout?: number
) => {
  const options: {
    headers: Record<string, string>;
  } = {
    headers: {
      'lasso-api-key': `${credentials.apiKey}`,
    },
  };

  // Add optional headers if provided
  if (conversationId) {
    options.headers['lasso-conversation-id'] = conversationId;
  }

  if (userId) {
    options.headers['lasso-user-id'] = userId;
  }

  let baseURL = LASSO_BASE_URL;
  let url = `${baseURL}/gateway/v2/classify`;

  return post<LassoClassifyResponse>(url, data, options, timeout);
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true; // Default to allowing the request
  let data = null;

  try {
    // Extract messages from the context
    let messages = context.request?.json?.messages || [];

    // Process messages to ensure content is a string
    messages = messages.map((message: Message) => {
      if (typeof message.content === 'string') {
        return message;
      } else {
        // Handle content that might be an array of objects (e.g., OpenAI format)
        const textContent = message.content?.reduce(
          (value, item) =>
            value + (item.type === 'text' ? item.text || '' : ''),
          ''
        );
        return { ...message, content: textContent };
      }
    });

    // Prepare the request payload
    const payload: LassoClassifyRequest = {
      messages: messages,
    };

    // Extract optional parameters
    const conversationId = parameters.conversationId as string | undefined;
    const userId = parameters.userId as string | undefined;

    // Call the Lasso Security Deputies API
    const result = await classify(
      parameters.credentials || {},
      payload,
      conversationId,
      userId,
      parameters.timeout
    );

    // If any violations were detected, block the request
    verdict = !result.violations_detected;

    data = result;
  } catch (e: any) {
    console.error('Error calling Lasso Security API:', e);
    delete e.stack;
    error = e;
    verdict = false; // Block on error to be safe
  }

  return { error, verdict, data };
};
