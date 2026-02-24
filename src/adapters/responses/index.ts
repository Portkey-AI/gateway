/**
 * Responses API Adapter
 *
 * Enables all providers to support the OpenAI Responses API by translating
 * to/from the Chat Completions format at the handler level.
 */

export { transformResponsesToChatCompletions } from './requestTransform';
export {
  transformChatCompletionsToResponses,
  createResponsesAdapterTransformer,
} from './responseTransform';
export { transformStreamChunk, createStreamState } from './streamTransform';

// Providers that natively support the Responses API (no adapter needed)
const NATIVE_PROVIDERS = new Set([
  'openai',
  'azure-openai',
  'x-ai',
  'groq',
  'openrouter',
]);

export function supportsResponsesApiNatively(provider: string): boolean {
  return NATIVE_PROVIDERS.has(provider?.toLowerCase() || '');
}
