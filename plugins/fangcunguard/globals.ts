import { post } from '../utils';

export const FANGCUN_BASE_URL = 'https://api.fangcunleap.com';

/**
 * Classify a piece of text with FangcunGuard.
 *
 * Returns the classification payload:
 *   { is_safe, label, label_idx, confidence, unsafe_score, model }
 */
export const postFangcunGuard = async (
  credentials: any,
  text: string,
  timeout?: number
) => {
  const baseURL = credentials?.customHost || FANGCUN_BASE_URL;
  const options = {
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
    },
  };
  return post(
    `${baseURL.replace(/\/$/, '')}/guard/context`,
    { text },
    options,
    timeout
  );
};
