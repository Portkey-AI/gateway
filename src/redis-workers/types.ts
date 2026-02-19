import { EntityStatus } from '../middlewares/portkey/globals';

export type SyncTransactionDataFormat = {
  prompts: string[];
  promptsV2: EntityV2[];
  configs: string[];
  configsV2: EntityV2[];
  virtualKeys: string[];
  virtualKeysV2: EntityV2[];
  promptPartials: string[];
  promptPartialsV2: EntityV2[];
  apiKeyIds: string[];
  guardrails: string[];
  virtualKeyIdsToReset: string[];
  virtualKeyIdsToResetV2: EntityV2[];
  apiKeysToReset: string[];
  apiKeysToResetV2: EntityV2[];
  guardrailsV2: EntityV2[];
  integrationsV2: EntityV2[];
  virtualKeysWithBudgets: EntityV2[];
  apiKeyIdsWithBudgets: EntityV2[];
  usageLimitsPolicyUpdatedValues?: UsageLimitsPolicyUpdatedValue[];
  // MCP-related sync data
  mcpServersV2?: McpServerEntityV2[];
  mcpCapabilitiesV2?: McpCapabilityEntityV2[];
  mcpUserAccessV2?: McpUserAccessEntityV2[];
};

type EntityV2 = {
  slug: string;
  workspace_id: string;
  id?: string;
  key?: string;
  usage_type?: string;
};

export type UsageLimitsPolicyUpdatedValue = {
  policy_id: string;
  value_key: string;
  workspace_id: string;
  status: EntityStatus;
};

// MCP-related entity types
export type McpServerEntityV2 = {
  /** Server ID (slug) */
  slug: string;
  /** Workspace ID */
  workspace_id: string;
  /** If true, invalidate all cached tokens for this server (core details changed) */
  reset_tokens?: boolean;
  /** If true, invalidate capabilities cache for this server (disabled capabilities changed) */
  reset_capabilities?: boolean;
};

export type McpCapabilityEntityV2 = {
  server_id: string;
  workspace_id: string;
};

export type McpUserAccessEntityV2 = {
  server_id: string;
  user_id: string;
  workspace_id: string;
};
