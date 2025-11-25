import { BedrockMessagesParams } from '../types';
import { ToolUnion } from '../../../types/MessagesRequest';

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
function requiresAdvancedToolUseBeta(tools?: ToolUnion[]): boolean {
  if (!tools) return false;

  return tools.some((tool) => {
    // Check for advanced tool types
    if (tool.type && ADVANCED_TOOL_TYPES.includes(tool.type)) {
      return true;
    }
    // Check for advanced tool use properties (only present on Tool type)
    const toolWithAdvanced = tool as {
      defer_loading?: boolean;
      allowed_callers?: string[];
      input_examples?: Record<string, unknown>[];
    };
    if (
      toolWithAdvanced.defer_loading !== undefined ||
      toolWithAdvanced.allowed_callers ||
      toolWithAdvanced.input_examples
    ) {
      return true;
    }
    return false;
  });
}

export const transformInferenceConfig = (params: BedrockMessagesParams) => {
  const inferenceConfig: Record<string, any> = {};
  if (params['max_tokens']) {
    inferenceConfig['maxTokens'] = params['max_tokens'];
  }
  if (params['temperature']) {
    inferenceConfig['temperature'] = params['temperature'];
  }
  if (params['top_p']) {
    inferenceConfig['topP'] = params['top_p'];
  }
  if (params['stop_sequences']) {
    inferenceConfig['stopSequences'] = params['stop_sequences'];
  }
  return inferenceConfig;
};

export const transformAnthropicAdditionalModelRequestFields = (
  params: BedrockMessagesParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields ||
    params.additional_model_request_fields ||
    {};
  if (params['top_k']) {
    additionalModelRequestFields['top_k'] = params['top_k'];
  }
  if (params['anthropic_version']) {
    additionalModelRequestFields['anthropic_version'] =
      params['anthropic_version'];
  }
  if (params['thinking']) {
    additionalModelRequestFields['thinking'] = params['thinking'];
  }

  // Handle anthropic_beta header, adding advanced tool use beta if needed
  let betaHeaders: string[] = [];
  if (params['anthropic_beta']) {
    if (typeof params['anthropic_beta'] === 'string') {
      betaHeaders = [params['anthropic_beta']];
    } else {
      betaHeaders = params['anthropic_beta'];
    }
  }

  // Add advanced tool use beta if features are used
  if (
    requiresAdvancedToolUseBeta(params.tools) &&
    !betaHeaders.includes(ADVANCED_TOOL_USE_BETA)
  ) {
    betaHeaders.push(ADVANCED_TOOL_USE_BETA);
  }

  if (betaHeaders.length) {
    additionalModelRequestFields['anthropic_beta'] = betaHeaders;
  }

  return additionalModelRequestFields;
};

export const transformToolsConfig = (params: BedrockMessagesParams) => {
  let toolChoice = undefined;
  let tools = [];
  if (params.tool_choice) {
    if (params.tool_choice.type === 'auto') {
      toolChoice = {
        auto: {},
      };
    } else if (params.tool_choice.type === 'any') {
      toolChoice = {
        any: {},
      };
    } else if (params.tool_choice.type === 'tool') {
      toolChoice = {
        tool: {
          name: params.tool_choice.name,
        },
      };
    }
  }
  if (params.tools) {
    for (const tool of params.tools) {
      if (tool.type === 'custom' || !tool.type) {
        const toolSpec: Record<string, any> = {
          name: tool.name,
          inputSchema: { json: tool.input_schema },
          description: tool.description,
        };

        // Add advanced tool use properties
        if (tool.defer_loading !== undefined) {
          toolSpec.defer_loading = tool.defer_loading;
        }
        if (tool.allowed_callers) {
          toolSpec.allowed_callers = tool.allowed_callers;
        }
        if (tool.input_examples) {
          toolSpec.input_examples = tool.input_examples;
        }

        tools.push({ toolSpec });

        if (tool.cache_control) {
          tools.push({
            cachePoint: {
              type: 'default',
            },
          });
        }
      }
    }
  }
  return { tools, toolChoice };
};
