import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

const addPrefixToCompletion = (
  context: PluginContext,
  prefix: string
): Record<string, any> => {
  const json = context.request.json;
  const updatedJson = { ...json };

  // For completion requests, just prepend the prefix to the prompt
  if (json.prompt) {
    updatedJson.prompt = prefix + json.prompt;
  }

  return {
    request: {
      json: updatedJson,
    },
    response: {
      json: null,
    },
  };
};

const addPrefixToChatCompletion = (
  context: PluginContext,
  prefix: string,
  applyToRole: string = 'user',
  addToExisting: boolean = true,
  onlyIfEmpty: boolean = false
): Record<string, any> => {
  const json = context.request.json;
  const updatedJson = { ...json };
  const messages = [...json.messages];

  // Find the target role message
  const targetIndex = messages.findIndex((msg) => msg.role === applyToRole);

  if (targetIndex !== -1) {
    // Message with target role exists
    if (onlyIfEmpty) {
      // Only apply if specifically requested and role exists (don't modify)
      return {
        request: {
          json: updatedJson,
        },
        response: {
          json: null,
        },
      };
    }

    if (addToExisting) {
      // Add prefix to existing message
      messages[targetIndex] = {
        ...messages[targetIndex],
        content: prefix + messages[targetIndex].content,
      };
    } else {
      // Create new message with prefix before the existing one
      const newMessage = {
        role: applyToRole,
        content: prefix,
      };
      messages.splice(targetIndex, 0, newMessage);
    }
  } else {
    // No message with target role exists, create one
    const newMessage = {
      role: applyToRole,
      content: prefix,
    };

    if (applyToRole === 'system') {
      // System messages should go first
      messages.unshift(newMessage);
    } else if (applyToRole === 'user') {
      // User messages can go at the end or in logical position
      messages.push(newMessage);
    } else {
      // Assistant or other roles
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
    // Only process before request and only for completion/chat completion
    if (
      eventType !== 'beforeRequestHook' ||
      (context.requestType !== 'complete' &&
        context.requestType !== 'chatComplete')
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

    if (context.requestType === 'chatComplete') {
      // Handle chat completion
      newTransformedData = addPrefixToChatCompletion(
        context,
        prefix,
        parameters.applyToRole || 'user',
        parameters.addToExisting !== false, // default to true
        parameters.onlyIfEmpty === true // default to false
      );
    } else {
      // Handle regular completion
      newTransformedData = addPrefixToCompletion(context, prefix);
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
    error = e;
  }

  return { error, verdict, data, transformedData, transformed };
};
