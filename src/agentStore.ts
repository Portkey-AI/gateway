import { ProxyAgent, Agent as UndiciAgent } from 'undici';
import http from 'node:http';
import https from 'node:https';
import { Environment } from './utils/env';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { logger } from './apm';

interface Agents {
  httpsAgent?: UndiciAgent;
  httpsNodeFetchAgent?: https.Agent;
  externalHttpsProxyAgent?: ProxyAgent;
  externalHttpsNodeFetchProxyAgent?: https.Agent;
  externalHttpsAgent?: UndiciAgent | ProxyAgent;
  externalHttpsNodeFetchAgent?: https.Agent;
  externalHttpNodeFetchAgent?: http.Agent;
}

export interface AgentConfig {
  tls?: {
    key?: string;
    cert?: string;
    ca?: string[];
  };
}

const env = Environment({});
const store: Agents = {};

// Read and parse NO_PROXY once at initialization
// Supports both NO_PROXY and no_proxy variants.
const NO_PROXY = (env?.NO_PROXY || '').trim();
const NO_PROXY_TOKENS = NO_PROXY
  ? NO_PROXY.split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
  : [];

// Pre-compile regex patterns for wildcard NO_PROXY tokens
const WILDCARD_REGEX_CACHE = new Map<string, RegExp>();
for (const token of NO_PROXY_TOKENS) {
  try {
    const tokenHost = token.includes(':') ? token.split(':')[0] : token;
    if (tokenHost.includes('*')) {
      const re = new RegExp(
        '^' +
          tokenHost
            .toLowerCase()
            .split('*')
            .map((part: string) => part.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&'))
            .join('.*') +
          '$'
      );
      WILDCARD_REGEX_CACHE.set(tokenHost.toLowerCase(), re);
    }
  } catch (error) {
    // Ignore invalid regex patterns in NO_PROXY
    logger.warn(`Invalid NO_PROXY pattern "${token}":`, error);
  }
}

// Optimized port lookup
const DEFAULT_PORTS: Record<string, string> = {
  http: '80',
  https: '443',
  ws: '80',
  wss: '443',
};

function getDefaultPort(protocol?: string): string | undefined {
  if (!protocol) return undefined;
  const p = protocol.replace(':', '').toLowerCase();
  return DEFAULT_PORTS[p];
}

function extractHostPort(target: string): {
  host: string;
  port?: string;
  protocol?: string;
} {
  try {
    // If it's a URL, parse it
    const u = new URL(target);
    const host = u.hostname || '';
    const port = u.port || getDefaultPort(u.protocol);
    return { host, port, protocol: u.protocol };
  } catch {
    // Fallback: could be host[:port]
    const withoutBrackets =
      target.startsWith('[') && target.endsWith(']')
        ? target.slice(1, -1)
        : target;
    const idx = withoutBrackets.lastIndexOf(':');
    if (idx > -1 && withoutBrackets.indexOf(':') === idx) {
      // single ':' → host:port
      const host = withoutBrackets.slice(0, idx);
      const port = withoutBrackets.slice(idx + 1);
      return { host, port };
    }
    return { host: withoutBrackets };
  }
}

function matchNoProxyToken(
  host: string,
  port: string | undefined,
  tokenRaw: string
): boolean {
  const token = tokenRaw.toLowerCase();

  // '*' disables proxy for all
  if (token === '*') return true;

  // token may include port
  let tokenHost = token;
  let tokenPort: string | undefined;
  const colonIdx = token.lastIndexOf(':');
  if (colonIdx > -1 && token.indexOf(':') === colonIdx) {
    tokenHost = token.slice(0, colonIdx);
    tokenPort = token.slice(colonIdx + 1);
    if (tokenPort && port && tokenPort !== port) {
      return false; // port specified and doesn't match
    }
  }

  // Strip IPv6 brackets for comparison
  const normHost = host.replace(/^\[/, '').replace(/\]$/, '');

  // Wildcards like *.example.com or *-internal.example.com
  if (tokenHost.includes('*')) {
    // Use pre-compiled regex pattern
    const re = WILDCARD_REGEX_CACHE.get(tokenHost);
    return re ? re.test(normHost) : false;
  }

  // Leading dot means domain or subdomain
  if (tokenHost.startsWith('.')) {
    return normHost === tokenHost.slice(1) || normHost.endsWith(tokenHost);
  }

  // Exact or suffix domain match (common NO_PROXY behavior)
  return normHost === tokenHost || normHost.endsWith(`.${tokenHost}`);
}

function shouldBypassProxy(target: string): boolean {
  if (NO_PROXY_TOKENS.length === 0) return false;

  const { host, port, protocol } = extractHostPort(target);
  if (!host) return false;

  const effPort = port || getDefaultPort(protocol);
  const lowerHost = host.toLowerCase();

  // If any token matches, bypass proxy
  for (const token of NO_PROXY_TOKENS) {
    if (matchNoProxyToken(lowerHost, effPort, token)) return true;
  }
  return false;
}

function extractProtocol(url: string): string | undefined {
  const idx = url.indexOf('://');
  return idx > -1 ? url.slice(0, idx) : undefined;
}

const REQUEST_TIMEOUT =
  env?.REQUEST_TIMEOUT && parseInt(env.REQUEST_TIMEOUT)
    ? parseInt(env.REQUEST_TIMEOUT)
    : undefined;

export function getInternalHttpsAgent(): UndiciAgent | ProxyAgent | undefined {
  return store.httpsAgent;
}

export function getInternalHttpsNodeFetchAgent(): https.Agent | undefined {
  return store.httpsNodeFetchAgent;
}

export function getExternalHttpsAgentForUrl(target: string) {
  if (store.externalHttpsProxyAgent && !shouldBypassProxy(target)) {
    return store.externalHttpsProxyAgent;
  }
  return store.externalHttpsAgent;
}

export function getExternalNodeFetchAgentForUrl(
  target: string
): http.Agent | https.Agent | undefined {
  if (store.externalHttpsNodeFetchProxyAgent && !shouldBypassProxy(target)) {
    return store.externalHttpsNodeFetchProxyAgent;
  }
  const protocol = extractProtocol(target);
  if (protocol === 'https' || protocol === 'wss') {
    return store.externalHttpsNodeFetchAgent;
  }
  return store.externalHttpNodeFetchAgent;
}

export function buildAgents(agentConfig: AgentConfig) {
  // internal agents
  if (agentConfig.tls) {
    store.httpsAgent = new UndiciAgent({
      ...(REQUEST_TIMEOUT
        ? { headersTimeout: REQUEST_TIMEOUT, bodyTimeout: REQUEST_TIMEOUT }
        : {}),
      connect: agentConfig.tls,
    });
    store.httpsNodeFetchAgent = new https.Agent({
      ...(REQUEST_TIMEOUT ? { timeout: REQUEST_TIMEOUT } : {}),
      ...agentConfig.tls,
    });
  }

  // external agents
  if (env.HTTP_PROXY || env.HTTPS_PROXY) {
    const proxyUrl = env.HTTP_PROXY || env.HTTPS_PROXY;
    store.externalHttpsNodeFetchProxyAgent = new HttpsProxyAgent(
      proxyUrl,
      // @ts-expect-error - HttpsProxyAgentOptions is not typed
      REQUEST_TIMEOUT ? { timeout: REQUEST_TIMEOUT } : undefined
    );
    store.externalHttpsProxyAgent = new ProxyAgent({
      uri: proxyUrl,
      ...(REQUEST_TIMEOUT
        ? { headersTimeout: REQUEST_TIMEOUT, bodyTimeout: REQUEST_TIMEOUT }
        : {}),
    });
  }

  if (REQUEST_TIMEOUT) {
    store.externalHttpsAgent = new UndiciAgent({
      headersTimeout: REQUEST_TIMEOUT,
      bodyTimeout: REQUEST_TIMEOUT,
    });
    store.externalHttpNodeFetchAgent = new http.Agent({
      timeout: REQUEST_TIMEOUT,
    });
    store.externalHttpsNodeFetchAgent = new https.Agent({
      timeout: REQUEST_TIMEOUT,
    });
  }
}
