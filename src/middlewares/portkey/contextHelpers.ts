/**
 * Context Helpers for Portkey Middleware
 *
 * This module provides type-safe utilities for storing and retrieving data
 * from Hono's context, replacing the previous pattern of serializing objects
 * to headers for inter-service communication.
 *
 * Benefits:
 * - Eliminates redundant JSON.parse/stringify operations
 * - Provides type safety for context values
 * - Reduces latency by avoiding serialization overhead
 * - Cleaner code with explicit context keys
 */

import type { Context } from 'hono';
import type {
  OrganisationDetails,
  VirtualKeyDetails,
  IntegrationDetails,
} from './types';
import type { HookObject } from '../hooks/types';

/**
 * Typed context keys for values managed by context helpers.
 * These keys have corresponding entries in PortkeyContextValues
 * and are type-safe with getContext/setContext.
 */
export enum ContextKeys {
  // Core data objects (previously serialized to headers)
  ORGANISATION_DETAILS = 'organisationDetails',
  PARSED_CONFIG = 'parsedConfig',
  PARSED_METADATA = 'parsedMetadata',
  VIRTUAL_KEY_DETAILS = 'virtualKeyDetails',
  INTEGRATION_DETAILS = 'integrationDetails',

  // Guardrails (previously serialized to headers)
  DEFAULT_INPUT_GUARDRAILS = 'defaultInputGuardrails',
  DEFAULT_OUTPUT_GUARDRAILS = 'defaultOutputGuardrails',

  // Request data
  REQUEST_BODY_DATA = 'requestBodyData',
  MAPPED_HEADERS = 'mappedHeaders',
}

/**
 * Legacy context keys that are set/read via c.get()/c.set() directly.
 * These are NOT typed through PortkeyContextValues and exist here
 * only for documentation and discoverability. Do not pass these to
 * getContext/setContext — use c.get(LegacyContextKeys.XXX) instead.
 */
export enum LegacyContextKeys {
  HEADERS_OBJ = 'headersObj',
  HOOKS_MANAGER = 'hooksManager',
  GET_FROM_CACHE = 'getFromCache',
  CACHE_IDENTIFIER = 'cacheIdentifier',
  PRE_REQUEST_VALIDATOR = 'preRequestValidator',
  REQUEST_OPTIONS = 'requestOptions',
  PROMPT_COMPLETIONS_ENDPOINT = 'promptCompletionsEndpoint',
}

/**
 * Type-safe interface for all context values.
 * This provides autocomplete and type checking when accessing context.
 */
export interface PortkeyContextValues {
  [ContextKeys.ORGANISATION_DETAILS]: OrganisationDetails;
  [ContextKeys.PARSED_CONFIG]: Record<string, any> | null;
  [ContextKeys.PARSED_METADATA]: Record<string, string>;
  [ContextKeys.VIRTUAL_KEY_DETAILS]: VirtualKeyDetails | null;
  [ContextKeys.INTEGRATION_DETAILS]: IntegrationDetails | null;
  [ContextKeys.DEFAULT_INPUT_GUARDRAILS]: HookObject[];
  [ContextKeys.DEFAULT_OUTPUT_GUARDRAILS]: HookObject[];
  [ContextKeys.REQUEST_BODY_DATA]: {
    bodyJSON: Record<string, any>;
    bodyFormData: FormData | null;
    requestBinary: ArrayBuffer | null;
  };
  [ContextKeys.MAPPED_HEADERS]: Record<string, string>;
}

/**
 * Type-safe getter for context values.
 * Returns undefined if the key hasn't been set.
 *
 * @param c - Hono context
 * @param key - The context key to retrieve
 * @returns The value or undefined
 *
 * @example
 * const orgDetails = getContext(c, ContextKeys.ORGANISATION_DETAILS);
 * if (orgDetails) {
 *   console.log(orgDetails.id);
 * }
 */
export function getContext<K extends keyof PortkeyContextValues>(
  c: Context,
  key: K
): PortkeyContextValues[K] | undefined {
  return c.get(key) as PortkeyContextValues[K] | undefined;
}

/**
 * Type-safe setter for context values.
 *
 * @param c - Hono context
 * @param key - The context key to set
 * @param value - The value to store
 *
 * @example
 * setContext(c, ContextKeys.ORGANISATION_DETAILS, orgDetails);
 */
export function setContext<K extends keyof PortkeyContextValues>(
  c: Context,
  key: K,
  value: PortkeyContextValues[K]
): void {
  c.set(key, value);
}

/**
 * Get a value from context, or parse it from a header if not present.
 * This is useful during the migration period where some code paths
 * may not have set the context value yet.
 *
 * @param c - Hono context
 * @param contextKey - The context key to check first
 * @param headerKey - The header key to fall back to
 * @param headersObj - The headers object containing raw header values
 * @returns The parsed value, or undefined if neither source has the data
 *
 * @example
 * const orgDetails = getOrParseFromHeader(
 *   c,
 *   ContextKeys.ORGANISATION_DETAILS,
 *   PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS,
 *   headersObj
 * );
 */
export function getOrParseFromHeader<K extends keyof PortkeyContextValues>(
  c: Context,
  contextKey: K,
  headerKey: string,
  headersObj: Record<string, string>
): PortkeyContextValues[K] | undefined {
  // First, check if value exists in context
  const contextValue = getContext(c, contextKey);
  if (contextValue !== undefined) {
    return contextValue;
  }

  // Fall back to parsing from header
  const headerValue = headersObj[headerKey];
  if (headerValue) {
    try {
      const parsed = JSON.parse(headerValue) as PortkeyContextValues[K];
      // Cache in context for future use
      setContext(c, contextKey, parsed);
      return parsed;
    } catch {
      // If parsing fails, return undefined
      return undefined;
    }
  }

  return undefined;
}

/**
 * Check if a context value has been set.
 *
 * @param c - Hono context
 * @param key - The context key to check
 * @returns true if the value exists in context
 */
export function hasContext(c: Context, key: ContextKeys): boolean {
  return c.get(key) !== undefined;
}
