import { ORACLE } from '../../globals';
import { ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

/**
 * Oracle GenAI Model Listing
 *
 * Maps to OCI GenAI /models endpoint to list available models
 * Returns OpenAI-compatible /v1/models format
 */

export interface OracleModelItem {
  id: string;
  displayName: string;
  vendor: string;
  version: string;
  capabilities: string[];
  timeCreated: string;
  lifecycleState: string;
  lifecycleDetails: string;
  timeOnDemandRetired: string | null;
  fineTuneType: string | null;
}

export interface OracleListModelsResponse {
  items: OracleModelItem[];
}

export interface OracleListModelsErrorResponse {
  code: number;
  message: string;
}

/**
 * Map OCI capabilities to OpenAI-style permissions
 */
const mapCapabilitiesToPermissions = (capabilities: string[]) => {
  const permissions: Record<string, boolean> = {
    allow_fine_tuning: capabilities.includes('FINE_TUNE'),
    allow_chat: capabilities.includes('CHAT'),
    allow_embeddings: capabilities.includes('TEXT_EMBEDDINGS'),
    allow_rerank: capabilities.includes('TEXT_RERANK'),
    allow_text_generation: capabilities.includes('TEXT_GENERATION'),
  };
  return permissions;
};

/**
 * Transform Oracle model list response to OpenAI format
 */
export const OracleListModelsResponseTransform: (
  response: OracleListModelsResponse | OracleListModelsErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers
) => any | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'code' in response) {
    return generateErrorResponse(
      {
        message: response.message || 'Unknown error',
        type: response.code?.toString() || null,
        param: null,
        code: response.code?.toString() || null,
      },
      ORACLE
    );
  }

  if ('items' in response) {
    // Filter out retired models and transform to OpenAI format
    const models = response.items
      .filter((model) => {
        // Include models that are not retired for ON_DEMAND
        // or show all if user wants to see dedicated-only models
        return model.lifecycleState === 'ACTIVE';
      })
      .map((model) => ({
        id: model.displayName || model.id,
        object: 'model',
        created: new Date(model.timeCreated).getTime() / 1000,
        owned_by: model.vendor || 'oracle',
        permission: [mapCapabilitiesToPermissions(model.capabilities || [])],
        root: model.displayName || model.id,
        parent: null,
        // Oracle-specific metadata
        oracle_metadata: {
          capabilities: model.capabilities,
          lifecycle_state: model.lifecycleState,
          lifecycle_details: model.lifecycleDetails,
          on_demand_retired: model.timeOnDemandRetired,
          fine_tune_type: model.fineTuneType,
        },
      }));

    return {
      object: 'list',
      data: models,
    };
  }

  return generateInvalidProviderResponseError(response, ORACLE);
};

/**
 * Get the Oracle list models endpoint
 * Note: This uses the management API, not the inference API
 */
export const getOracleListModelsEndpoint = (compartmentId: string): string => {
  return `/20231130/models?compartmentId=${encodeURIComponent(compartmentId)}`;
};

/**
 * Get the base URL for Oracle management API (different from inference)
 */
export const getOracleManagementBaseURL = (region: string): string => {
  return `https://generativeai.${region}.oci.oraclecloud.com`;
};
