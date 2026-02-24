import { HEADER_KEYS } from '../../../globals';

export const findApiKey = (
  reqBody: Record<string, any>,
  reqHeaders: Record<string, any>,
  proxyMode: string,
  lastUsedOptionIndex: string | number,
  url: string
) => {
  // this is done for the palm APIs where the URL params contain the API key
  const urlParams = new URL(url).searchParams;
  const key = urlParams.get('key');
  if (key) {
    return key;
  }

  // for proxy calls without configs & managed model calls
  return (
    reqHeaders['authorization'] ||
    reqHeaders[HEADER_KEYS.X_API_KEY] ||
    reqHeaders[HEADER_KEYS.API_KEY] ||
    null
  );
};

export const sanitiseURL = (url_string: string) => {
  const url = new URL(url_string);
  const searchParams = url.searchParams;
  if (searchParams.get('key')) {
    searchParams.delete('key');
  }
  url.search = searchParams.toString();
  return url.toString();
};
