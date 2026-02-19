/**
 * Messages API Adapter
 *
 * Enables any provider to accept Anthropic Messages API format by transforming
 * to/from Chat Completions as an intermediate format.
 *
 * Native providers (anthropic, bedrock) bypass the adapter.
 */
import {
  ANTHROPIC,
  AZURE_AI_INFERENCE,
  BEDROCK,
  GOOGLE_VERTEX_AI,
} from '../../globals';

// Providers that natively support the Messages API
const PROVIDERS_THAT_HANDLE_MESSAGES_FOR_ALL_MODELS = new Set([
  ANTHROPIC,
  BEDROCK,
]);

const PROVIDERS_THAT_HANDLE_MESSAGES_FOR_ANTHROPIC_MODELS = new Set([
  GOOGLE_VERTEX_AI,
  AZURE_AI_INFERENCE,
]);

/**
 * Check if a provider natively supports the Messages API
 */
export function supportsMessagesApiNatively(
  provider: string,
  model: string
): boolean {
  return (
    (PROVIDERS_THAT_HANDLE_MESSAGES_FOR_ANTHROPIC_MODELS.has(
      provider.toLowerCase()
    ) &&
      model.includes('claude')) ||
    PROVIDERS_THAT_HANDLE_MESSAGES_FOR_ALL_MODELS.has(provider.toLowerCase())
  );
}

export { transformMessagesToChatCompletions } from './requestTransform';
export { transformChatCompletionsToMessages } from './responseTransform';
export { transformStreamChunk, createStreamState } from './streamTransform';
