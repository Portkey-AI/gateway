import { post } from '../utils';
import { GuardResult, PIIResult, HarmResult, PromptfooResult } from './types';

export const PROMPTFOO_BASE_URL = 'https://api.promptfoo.dev/v1';

export const postPromptfoo = async <
  T extends GuardResult | PIIResult | HarmResult,
>(
  endpoint: string,
  data: any,
  timeout?: number
): Promise<PromptfooResult<T>> => {
  const options = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  switch (endpoint) {
    case 'guard':
      return post(
        `${PROMPTFOO_BASE_URL}/guard`,
        data,
        options,
        timeout
      ) as Promise<PromptfooResult<T>>;
    case 'pii':
      return post(
        `${PROMPTFOO_BASE_URL}/pii`,
        data,
        options,
        timeout
      ) as Promise<PromptfooResult<T>>;
    case 'harm':
      return post(
        `${PROMPTFOO_BASE_URL}/harm`,
        data,
        options,
        timeout
      ) as Promise<PromptfooResult<T>>;
    default:
      throw new Error(`Unknown Promptfoo endpoint: ${endpoint}`);
  }
};
