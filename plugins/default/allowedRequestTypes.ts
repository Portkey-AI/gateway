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
  let verdict = false;
  let data: any = null;

  try {
    // Get allowed and blocked request types from parameters or metadata
    let allowedTypes: string[] = [];
    let blockedTypes: string[] = [];

    // First check if allowedTypes is provided in parameters
    if (parameters.allowedTypes) {
      if (Array.isArray(parameters.allowedTypes)) {
        allowedTypes = parameters.allowedTypes;
      } else if (typeof parameters.allowedTypes === 'string') {
        // Support comma-separated string
        allowedTypes = parameters.allowedTypes
          .split(',')
          .map((t: string) => t.trim());
      }
    }

    // Check if blockedTypes is provided in parameters
    if (parameters.blockedTypes) {
      if (Array.isArray(parameters.blockedTypes)) {
        blockedTypes = parameters.blockedTypes;
      } else if (typeof parameters.blockedTypes === 'string') {
        // Support comma-separated string
        blockedTypes = parameters.blockedTypes
          .split(',')
          .map((t: string) => t.trim());
      }
    }

    // If not in parameters, check metadata for supported_endpoints
    if (allowedTypes.length === 0 && context.metadata?.supported_endpoints) {
      if (Array.isArray(context.metadata.supported_endpoints)) {
        allowedTypes = context.metadata.supported_endpoints;
      } else if (typeof context.metadata.supported_endpoints === 'string') {
        // Support comma-separated string in metadata
        allowedTypes = context.metadata.supported_endpoints
          .split(',')
          .map((t: string) => t.trim());
      }
    }

    // Check metadata for blocked_endpoints
    if (blockedTypes.length === 0 && context.metadata?.blocked_endpoints) {
      if (Array.isArray(context.metadata.blocked_endpoints)) {
        blockedTypes = context.metadata.blocked_endpoints;
      } else if (typeof context.metadata.blocked_endpoints === 'string') {
        // Support comma-separated string in metadata
        blockedTypes = context.metadata.blocked_endpoints
          .split(',')
          .map((t: string) => t.trim());
      }
    }

    // Get the current request type from context
    const currentRequestType = context.requestType;

    if (!currentRequestType) {
      throw new Error('Request type not found in context');
    }

    // Check for conflicts when both lists are specified
    if (allowedTypes.length > 0 && blockedTypes.length > 0) {
      const conflicts = allowedTypes.filter((type) =>
        blockedTypes.includes(type)
      );
      if (conflicts.length > 0) {
        throw new Error(
          `Conflict detected: The following types appear in both allowedTypes and blockedTypes: ${conflicts.join(', ')}. Please remove them from one list.`
        );
      }
    }

    // Determine verdict based on the lists provided
    let mode = 'unrestricted';

    // If neither list is specified, allow all
    if (allowedTypes.length === 0 && blockedTypes.length === 0) {
      verdict = true;
      mode = 'unrestricted';
    }
    // If only blocklist is specified
    else if (allowedTypes.length === 0 && blockedTypes.length > 0) {
      verdict = !blockedTypes.includes(currentRequestType);
      mode = 'blocklist';
    }
    // If only allowlist is specified
    else if (allowedTypes.length > 0 && blockedTypes.length === 0) {
      verdict = allowedTypes.includes(currentRequestType);
      mode = 'allowlist';
    }
    // If both are specified (combined mode)
    else {
      const isBlocked = blockedTypes.includes(currentRequestType);
      const isInAllowList = allowedTypes.includes(currentRequestType);

      // Blocked takes precedence, then check allowlist
      if (isBlocked) {
        verdict = false;
      } else {
        verdict = isInAllowList;
      }
      mode = 'combined';
    }

    // Build appropriate explanation based on mode
    let explanation = '';
    if (mode === 'combined') {
      const isBlocked = blockedTypes.includes(currentRequestType);
      if (!verdict) {
        if (isBlocked) {
          explanation = `Request type "${currentRequestType}" is explicitly blocked.`;
        } else {
          explanation = `Request type "${currentRequestType}" is not in the allowed list. Allowed types (excluding blocked): ${allowedTypes.filter((t) => !blockedTypes.includes(t)).join(', ')}`;
        }
      } else {
        explanation = `Request type "${currentRequestType}" is allowed (in allowlist and not blocked).`;
      }
    } else if (mode === 'blocklist') {
      explanation = verdict
        ? `Request type "${currentRequestType}" is allowed (not in blocklist).`
        : `Request type "${currentRequestType}" is blocked.`;
    } else if (mode === 'allowlist') {
      explanation = verdict
        ? `Request type "${currentRequestType}" is allowed.`
        : `Request type "${currentRequestType}" is not allowed. Allowed types are: ${allowedTypes.join(', ')}`;
    } else {
      explanation = `Request type "${currentRequestType}" is allowed (no restrictions configured).`;
    }

    data = {
      currentRequestType,
      ...(allowedTypes.length > 0
        ? { allowedTypes }
        : mode === 'unrestricted'
          ? { allowedTypes: ['all'] }
          : {}),
      ...(blockedTypes.length > 0 && { blockedTypes }),
      verdict,
      explanation,
      source:
        parameters.allowedTypes || parameters.blockedTypes
          ? 'parameters'
          : context.metadata?.supported_endpoints ||
              context.metadata?.blocked_endpoints
            ? 'metadata'
            : 'default',
      mode,
    };
  } catch (e: any) {
    error = e;
    data = {
      explanation: `An error occurred while checking allowed request types: ${e.message}`,
      currentRequestType: context.requestType || 'unknown',
      allowedTypes:
        parameters.allowedTypes || context.metadata?.supported_endpoints || [],
      blockedTypes:
        parameters.blockedTypes || context.metadata?.blocked_endpoints || [],
    };
  }

  return { error, verdict, data };
};
