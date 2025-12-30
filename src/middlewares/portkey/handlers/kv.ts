import { INTERNAL_HEADER_KEYS } from '../globals';

/**
 * Asynchronously fetch data from the KV store.
 *
 * @param {any} env - Hono environment object.
 * @param {string} key - The key that needs to be retrieved from the KV store.
 * @returns {Promise<any | null>} - A Promise that resolves to the fetched data or null if an error occurs.
 */
export const fetchFromKVStore = async (
  env: any,
  key: string
): Promise<any | null> => {
  if (!env.KV_STORE_WORKER_BASEPATH) {
    return null;
  }
  const requestURL = `${env.KV_STORE_WORKER_BASEPATH}/${key}`;
  const fetchOptions = {
    headers: {
      [INTERNAL_HEADER_KEYS.CLIENT_AUTH_SECRET]: env.CLIENT_ID,
    },
  };
  try {
    const response = await env.kvStoreWorker.fetch(requestURL, fetchOptions);
    if (response.ok) {
      return response.json();
    } else if (response.status !== 404) {
      console.log(
        'invalid response from kv-store',
        response.status,
        await response.clone().text()
      );
    }
  } catch (error) {
    console.log('kv fetch error', error);
  }

  return null;
};

/**
 * Asynchronously puts data into the KV store.
 *
 * @param {any} env - Hono environment object.
 * @param {string} key - The key that needs to be stored with the value in the KV store.
 * @param {string} value - The data to be stored in the KV store.
 * @param {number} [expiry] - Optional expiration time for the stored data (in seconds).
 * @returns {Promise<void>} - A Promise that resolves when the data is successfully stored or logs an error if it occurs.
 */
export const putInKVStore = async (
  env: any,
  key: string,
  value: string,
  expiry?: number
): Promise<void> => {
  if (!env.KV_STORE_WORKER_BASEPATH) {
    return;
  }
  const requestURL = `${env.KV_STORE_WORKER_BASEPATH}/put`;
  const fetchOptions = {
    method: 'PUT',
    body: JSON.stringify({ key, value, expiry }),
    headers: {
      [INTERNAL_HEADER_KEYS.CLIENT_AUTH_SECRET]: env.CLIENT_ID,
    },
  };

  try {
    const response = await env.kvStoreWorker.fetch(requestURL, fetchOptions);
    if (!response.ok) {
      console.log(
        'failed status code from kv-store',
        response.status,
        await response.clone().text()
      );
    }
  } catch (err) {
    console.log('kv put error', err);
  }
};
