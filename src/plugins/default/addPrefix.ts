import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';

const addPrefixToCompletion = (
  context: PluginContext,
  prefix: string,
  eventType: HookEventType
): Record<string, any> => {
  const transformedData: Record<string, any> = {
    request: { json: null },
    response: { json: null },
  };

  const { content, textArray } = getCurrentContentPart(context, eventType);
  if (!content) {
    return transformedData;
  }

  const updatedTexts = (
    Array.isArray(textArray) ? textArray : [String(textArray)]
  ).map((text, index) => (index === 0 ? `${prefix}${text ?? ''}` : text));

  setCurrentContentPart(context, eventType, transformedData, updatedTexts);
  return transformedData;
};

const addPrefixToChatCompletion = (
  context: PluginContext,
  prefix: string,
  applyToRole: string = 'user',
  addToExisting: boolean = true,
  onlyIfEmpty: boolean = false,
  eventType: HookEventType
): Record<string, any> => {
  const json = context.request.json;
  const updatedJson = { ...json };
  const messages = Array.isArray(json.messages) ? [...json.messages] : [];

  // Find the target role message
  const targetIndex = messages.findIndex((msg) => msg.role === applyToRole);

  // Helper to build a message content with the prefix in both chatComplete and messages formats
  const buildPrefixedContent = (existing: any): any => {
    if (existing == null || typeof existing === 'string') {
      return `${prefix}${existing ?? ''}`;
    }
    if (Array.isArray(existing)) {
      if (existing.length > 0 && existing[0]?.type === 'text') {
        const cloned = existing.map((item) => ({ ...item }));
        cloned[0].text = `${prefix}${cloned[0]?.text ?? ''}`;
        return cloned;
      }
      return [{ type: 'text', text: prefix }, ...existing];
    }
    return `${prefix}${String(existing)}`;
  };

  // If the target role exists
  if (targetIndex !== -1) {
    const targetMsg = messages[targetIndex];
    const content = targetMsg?.content;

    const isEmptyContent =
      (typeof content === 'string' && content.trim().length === 0) ||
      (Array.isArray(content) && content.length === 0);

    if (onlyIfEmpty && !isEmptyContent) {
      // Respect onlyIfEmpty by skipping modification when non-empty
      return {
        request: { json: updatedJson },
        response: { json: null },
      };
    }

    if (addToExisting) {
      // If this is the last message, leverage utils to ensure messages route compatibility
      if (targetIndex === messages.length - 1) {
        const transformedData: Record<string, any> = {
          request: { json: null },
          response: { json: null },
        };
        const { content: currentContent, textArray } = getCurrentContentPart(
          context,
          eventType
        );
        if (currentContent !== null) {
          const updatedTexts = (
            Array.isArray(textArray) ? textArray : [String(textArray)]
          ).map((text, idx) => (idx === 0 ? `${prefix}${text ?? ''}` : text));
          setCurrentContentPart(
            context,
            eventType,
            transformedData,
            updatedTexts
          );
        }
        return transformedData;
      }

      // Otherwise, modify the specific message inline
      messages[targetIndex] = {
        ...targetMsg,
        content: buildPrefixedContent(targetMsg.content),
      };
    } else {
      // Create new message with prefix before the existing one
      const newMessage = {
        role: applyToRole,
        content:
          context.requestType === 'messages'
            ? [{ type: 'text', text: prefix }]
            : prefix,
      };
      messages.splice(targetIndex, 0, newMessage);
    }
  } else {
    // No message with target role exists, create one
    const newMessage = {
      role: applyToRole,
      content:
        context.requestType === 'messages'
          ? [{ type: 'text', text: prefix }]
          : prefix,
    };

    if (applyToRole === 'system') {
      messages.unshift(newMessage);
    } else {
      messages.push(newMessage);
    }
  }

  updatedJson.messages = messages;

  return {
    request: {
      json: updatedJson,
    },
    response: {
      json: null,
    },
  };
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true; // Always allow the request to continue
  let data = null;
  const transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  try {
    // Only process before request and only for completion/chat completion/messages
    if (
      eventType !== 'beforeRequestHook' ||
      !['complete', 'chatComplete', 'messages'].includes(
        context.requestType || ''
      )
    ) {
      return {
        error: null,
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    // Get prefix from parameters
    const prefix = parameters.prefix;
    if (!prefix || typeof prefix !== 'string') {
      return {
        error: { message: 'Prefix parameter is required and must be a string' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    // Check if request JSON exists
    if (!context.request?.json) {
      return {
        error: { message: 'Request JSON is empty or missing' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    let newTransformedData;

    if (
      context.requestType &&
      ['chatComplete', 'messages'].includes(context.requestType)
    ) {
      // Handle chat completion
      newTransformedData = addPrefixToChatCompletion(
        context,
        prefix,
        parameters.applyToRole || 'user',
        parameters.addToExisting !== false, // default to true
        parameters.onlyIfEmpty === true, // default to false
        eventType
      );
    } else {
      // Handle regular completion
      newTransformedData = addPrefixToCompletion(context, prefix, eventType);
    }

    Object.assign(transformedData, newTransformedData);
    transformed = true;

    data = {
      prefix: prefix,
      requestType: context.requestType,
      applyToRole: parameters.applyToRole || 'user',
      addToExisting: parameters.addToExisting !== false,
      onlyIfEmpty: parameters.onlyIfEmpty === true,
    };
  } catch (e: any) {
    delete e.stack;
    error = {
      message: `Error in addPrefix plugin: ${e.message || 'Unknown error'}`,
      originalError: e,
    };
  }

  return { error, verdict, data, transformedData, transformed };
};
