import { ProxyAgent, Agent as UndiciAgent } from 'undici';
import https from 'node:https';
import { Environment } from './utils/env';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface Agents {
  httpsAgent?: UndiciAgent;
  httpsNodeFetchAgent?: https.Agent;
  httpsProxyAgent?: ProxyAgent;
  httpsNodeFetchProxyAgent?: https.Agent;
}

const env = Environment({});
const store: Agents = {};

// Read NO_PROXY directly from env to avoid touching env.ts.
// Supports both NO_PROXY and no_proxy variants.
const NO_PROXY = (env?.NO_PROXY || '').trim();

// Parse NO_PROXY string into tokens
function parseNoProxyList(noProxy: string): string[] {
  return noProxy
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getDefaultPort(protocol?: string): string | undefined {
  if (!protocol) return undefined;
  const p = protocol.replace(':', '').toLowerCase();
  if (p === 'http') return '80';
  if (p === 'https') return '443';
  return undefined;
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
    // Escape regex special chars except '*', then replace '*' with '.*'
    const re = new RegExp(
      '^' +
        tokenHost
          .split('*')
          .map((part) => part.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&'))
          .join('.*') +
        '$'
    );
    return re.test(normHost);
  }

  // Leading dot means domain or subdomain
  if (tokenHost.startsWith('.')) {
    return normHost === tokenHost.slice(1) || normHost.endsWith(tokenHost);
  }

  // Exact or suffix domain match (common NO_PROXY behavior)
  return normHost === tokenHost || normHost.endsWith(`.${tokenHost}`);
}

function shouldBypassProxy(target: string): boolean {
  if (!NO_PROXY) return false;
  const tokens = parseNoProxyList(NO_PROXY);
  if (tokens.length === 0) return false;

  const { host, port, protocol } = extractHostPort(target);
  if (!host) return false;

  const effPort = port || getDefaultPort(protocol);

  // If any token matches, bypass proxy
  for (const t of tokens) {
    if (matchNoProxyToken(host.toLowerCase(), effPort, t)) return true;
  }
  return false;
}

if (env.HTTP_PROXY || env.HTTPS_PROXY) {
  store.httpsNodeFetchProxyAgent = new HttpsProxyAgent(
    env.HTTP_PROXY || env.HTTPS_PROXY
  );
  store.httpsProxyAgent = new ProxyAgent(env.HTTP_PROXY || env.HTTPS_PROXY);
}

export function setAgents(agents: Agents): void {
  store.httpsAgent = agents.httpsAgent;
  store.httpsNodeFetchAgent = agents.httpsNodeFetchAgent;
}

export function getInternalHttpsAgent(): UndiciAgent | ProxyAgent | undefined {
  return store.httpsAgent;
}

export function getInternalHttpsNodeFetchAgent(): https.Agent | undefined {
  return store.httpsNodeFetchAgent;
}

// Legacy getters (do not consider NO_PROXY because they lack URL context)
export function getHttpsProxyAgent(): ProxyAgent | undefined {
  return store.httpsProxyAgent;
}

export function getHttpsNodeFetchProxyAgent(): https.Agent | undefined {
  return store.httpsNodeFetchProxyAgent;
}

// New URL-aware getters: honor NO_PROXY
export function getHttpsProxyAgentForUrl(
  target: string
): ProxyAgent | undefined {
  if (!store.httpsProxyAgent) return undefined;
  if (shouldBypassProxy(target)) return undefined;
  return store.httpsProxyAgent;
}

export function getHttpsNodeFetchProxyAgentForUrl(
  target: string
): https.Agent | undefined {
  if (!store.httpsNodeFetchProxyAgent) return undefined;
  if (shouldBypassProxy(target)) return undefined;
  return store.httpsNodeFetchProxyAgent;
}
