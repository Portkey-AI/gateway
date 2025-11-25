import { ProviderAPIConfig } from '../types';
import { Params } from '../../types/requestBody';

// Beta header for advanced tool use features
const ADVANCED_TOOL_USE_BETA = 'advanced-tool-use-2025-11-20';

// Tool types that require the advanced tool use beta
const ADVANCED_TOOL_TYPES = [
  'tool_search_tool_regex_20251119',
  'tool_search_tool_bm25_20251119',
  'code_execution_20250825',
  'mcp_toolset',
];

/**
 * Check if the request uses advanced tool use features that require the beta header.
 */
function requiresAdvancedToolUseBeta(gatewayRequestBody?: Params): boolean {
  if (!gatewayRequestBody?.tools) return false;

  return gatewayRequestBody.tools.some((tool) => {
    // Check for advanced tool types
    if (tool.type && ADVANCED_TOOL_TYPES.includes(tool.type)) {
      return true;
    }
    // Check for advanced tool use properties
    if (
      tool.defer_loading !== undefined ||
      tool.allowed_callers ||
      tool.input_examples
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Combine beta headers, avoiding duplicates.
 */
function combineBetaHeaders(
  existingBeta: string,
  additionalBeta: string
): string {
  const existing = existingBeta.split(',').map((s) => s.trim());
  if (existing.includes(additionalBeta)) {
    return existingBeta;
  }
  return [...existing, additionalBeta].join(',');
}

const AnthropicAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.anthropic.com/v1',

  headers: ({
    providerOptions,
    fn,
    headers: requestHeaders,
    gatewayRequestBody,
  }) => {
    const apiKey =
      providerOptions.apiKey || requestHeaders?.['x-api-key'] || '';
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
    };

    // Accept anthropic_beta and anthropic_version in body to support environments which cannot send it in headers.
    let betaHeader =
      providerOptions?.['anthropicBeta'] ??
      gatewayRequestBody?.['anthropic_beta'] ??
      'messages-2023-12-15';
    const version =
      providerOptions?.['anthropicVersion'] ??
      gatewayRequestBody?.['anthropic_version'] ??
      '2023-06-01';

    // Add advanced tool use beta if needed
    if (requiresAdvancedToolUseBeta(gatewayRequestBody)) {
      betaHeader = combineBetaHeaders(betaHeader, ADVANCED_TOOL_USE_BETA);
    }

    if (fn === 'chatComplete' || fn === 'messages') {
      headers['anthropic-beta'] = betaHeader;
    }
    headers['anthropic-version'] = version;
    return headers;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/complete';
      case 'chatComplete':
        return '/messages';
      case 'messages':
        return '/messages';
      case 'messagesCountTokens':
        return '/messages/count_tokens';
      default:
        return '';
    }
  },
};

export default AnthropicAPIConfig;
