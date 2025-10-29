import nodeFetch, { RequestInit as NodeFetchRequestInit } from 'node-fetch';
import {
  getHttpsNodeFetchProxyAgentForUrl,
  getHttpsProxyAgentForUrl,
  getInternalHttpsAgent,
  getInternalHttpsNodeFetchAgent,
} from '../agentStore';

export async function internalServiceFetch(url: string, options: RequestInit) {
  const httpsAgent = getInternalHttpsAgent();
  return fetch(url, {
    ...options,
    ...(httpsAgent ? { dispatcher: httpsAgent } : {}),
  });
}

export async function internalServiceFetchWithNodeFetch(
  url: string,
  options: NodeFetchRequestInit
) {
  const httpsAgent = getInternalHttpsNodeFetchAgent();
  const optionsWithAgent = {
    ...options,
    ...(httpsAgent ? { agent: httpsAgent } : {}),
  } as NodeFetchRequestInit;
  return nodeFetch(url, optionsWithAgent);
}

export async function externalServiceFetch(url: string, options?: RequestInit) {
  const httpsAgent = getHttpsProxyAgentForUrl(url);
  return fetch(url, {
    ...options,
    ...(httpsAgent ? { dispatcher: httpsAgent } : {}),
  });
}

export async function externalServiceFetchWithNodeFetch(
  url: string,
  options: NodeFetchRequestInit
) {
  const httpsAgent = getHttpsNodeFetchProxyAgentForUrl(url);
  const optionsWithAgent = {
    ...options,
    ...(httpsAgent ? { agent: httpsAgent } : {}),
  } as NodeFetchRequestInit;
  return nodeFetch(url, optionsWithAgent);
}
