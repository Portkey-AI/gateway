import { ParameterConfig, ProviderConfig } from '../types';

export const messagesBaseConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
  },
  max_tokens: {
    param: 'max_tokens',
    required: true,
  },
  container: {
    param: 'container',
    required: false,
  },
  mcp_servers: {
    param: 'mcp_servers',
    required: false,
  },
  metadata: {
    param: 'metadata',
    required: false,
  },
  service_tier: {
    param: 'service_tier',
    required: false,
  },
  stop_sequences: {
    param: 'stop_sequences',
    required: false,
  },
  stream: {
    param: 'stream',
    required: false,
  },
  system: {
    param: 'system',
  },
  temperature: {
    param: 'temperature',
    required: false,
  },
  thinking: {
    param: 'thinking',
    required: false,
  },
  tool_choice: {
    param: 'tool_choice',
    required: false,
  },
  tools: {
    param: 'tools',
    required: false,
  },
  top_k: {
    param: 'top_k',
    required: false,
  },
  top_p: {
    param: 'top_p',
    required: false,
  },
};

export const getMessagesConfig = ({
  exclude = [],
  defaultValues = {},
  extra = {},
}: {
  exclude?: string[];
  defaultValues?: Record<
    keyof typeof messagesBaseConfig,
    string | number | boolean
  >;
  extra?: ProviderConfig;
}): ProviderConfig => {
  const baseParams = { ...messagesBaseConfig };
  if (defaultValues) {
    Object.keys(defaultValues).forEach((key) => {
      if (!Array.isArray(baseParams[key])) {
        (baseParams[key] as ParameterConfig).default = defaultValues[key];
      }
    });
  }
  exclude.forEach((key) => {
    // not checking if the key exists as if it doesnt, a build failure is expected
    delete baseParams[key];
  });

  return { ...baseParams, ...extra };
};
