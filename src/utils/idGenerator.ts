/**
 * OpenAI-compatible ID generator utility
 *
 * OpenAI ID patterns:
 * - Chat completions: chatcmpl-{29 alphanumeric chars}
 * - Tool calls: call_{24 alphanumeric chars}
 *
 * Total lengths:
 * - chatcmpl- prefix (8 chars) + 29 = 37 characters
 * - call_ prefix (5 chars) + 24 = 29 characters
 */

// Default sizes matching OpenAI's observed patterns
export const OPENAI_ID_DEFAULTS = {
  CHAT_COMPLETION_LENGTH: 29,
  TOOL_CALL_LENGTH: 24,
  BATCH_ID_LENGTH: 24,
  FILE_ID_LENGTH: 24,
};

// Prefixes used by OpenAI
export const OPENAI_ID_PREFIXES = {
  CHAT_COMPLETION: 'chatcmpl-',
  TOOL_CALL: 'call_',
  BATCH: 'batch_',
  FILE: 'file-',
};

const ALPHANUMERIC_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a random alphanumeric string of specified length
 * @param length - The length of the random string to generate
 * @returns Random alphanumeric string
 */
export function generateRandomAlphanumeric(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHANUMERIC_CHARS[array[i] % ALPHANUMERIC_CHARS.length];
  }
  return result;
}

/**
 * Validates if an ID matches OpenAI's expected format
 * @param id - The ID to validate
 * @param prefix - Expected prefix
 * @param minLength - Minimum length of the random part (optional)
 * @param maxLength - Maximum length of the random part (optional)
 * @returns boolean indicating if the ID is valid
 */
export function isValidOpenAIId(
  id: string,
  prefix: string,
  minLength?: number,
  maxLength?: number
): boolean {
  if (!id || typeof id !== 'string') return false;
  if (!id.startsWith(prefix)) return false;

  const randomPart = id.slice(prefix.length);
  if (minLength !== undefined && randomPart.length < minLength) return false;
  if (maxLength !== undefined && randomPart.length > maxLength) return false;

  // Check if random part is alphanumeric
  return /^[a-zA-Z0-9]+$/.test(randomPart);
}

export type IdType =
  | 'chatCompletion'
  | 'toolCall'
  | 'batch'
  | 'file'
  | 'rerank'
  | 'custom';

interface GenerateIdOptions {
  type: IdType;
  customPrefix?: string;
  length?: number;
}

/**
 * Generates an OpenAI-compatible ID
 * @param options - Configuration options for ID generation
 * @returns Generated ID string
 */
export function generateOpenAICompatibleId(options: GenerateIdOptions): string {
  const { type, customPrefix, length } = options;

  let prefix: string;
  let randomLength: number;

  switch (type) {
    case 'chatCompletion':
      prefix = OPENAI_ID_PREFIXES.CHAT_COMPLETION;
      randomLength = length ?? OPENAI_ID_DEFAULTS.CHAT_COMPLETION_LENGTH;
      break;
    case 'toolCall':
      prefix = OPENAI_ID_PREFIXES.TOOL_CALL;
      randomLength = length ?? OPENAI_ID_DEFAULTS.TOOL_CALL_LENGTH;
      break;
    case 'batch':
      prefix = OPENAI_ID_PREFIXES.BATCH;
      randomLength = length ?? OPENAI_ID_DEFAULTS.BATCH_ID_LENGTH;
      break;
    case 'file':
      prefix = OPENAI_ID_PREFIXES.FILE;
      randomLength = length ?? OPENAI_ID_DEFAULTS.FILE_ID_LENGTH;
      break;
    case 'rerank':
      prefix = 'rerank_';
      randomLength = length ?? OPENAI_ID_DEFAULTS.CHAT_COMPLETION_LENGTH;
      break;
    case 'custom':
      prefix = customPrefix ?? '';
      randomLength = length ?? OPENAI_ID_DEFAULTS.CHAT_COMPLETION_LENGTH;
      break;
    default:
      prefix = OPENAI_ID_PREFIXES.CHAT_COMPLETION;
      randomLength = OPENAI_ID_DEFAULTS.CHAT_COMPLETION_LENGTH;
  }

  return prefix + generateRandomAlphanumeric(randomLength);
}

/**
 * Gets an ID, honoring user-provided or upstream ID if valid, otherwise generates a new one
 * @param providedId - User-provided or upstream ID (optional)
 * @param type - Type of ID for generation/validation
 * @param options - Additional options
 * @returns Valid ID (provided or generated)
 */
export function getOrGenerateId(
  providedId: string | undefined | null,
  type: IdType,
  options?: {
    customPrefix?: string;
    length?: number;
  }
): string {
  const { customPrefix, length } = options ?? {};

  if (
    providedId &&
    typeof providedId === 'string' &&
    providedId.trim() !== ''
  ) {
    return providedId;
  }

  return generateOpenAICompatibleId({ type, customPrefix, length });
}
