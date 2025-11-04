import { Context } from 'hono';
import { CONTENT_TYPES, POWERED_BY, VALID_PROVIDERS } from '../../globals';
import { configSchema } from './schema/config';

// Parse allowed custom hosts from environment variable
// Format: comma-separated list of domains/IPs (e.g., "localhost,127.0.0.1,example.com")
const ALLOWED_CUSTOM_HOSTS = (() => {
  const envVar = process.env.ALLOWED_CUSTOM_HOSTS;
  if (!envVar) {
    // Default allowed hosts for local development
    return new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
  }
  return new Set(
    envVar
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0)
  );
})();

export const requestValidator = (c: Context, next: any) => {
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const contentType = requestHeaders['content-type'];
  if (
    !!contentType &&
    ![
      CONTENT_TYPES.APPLICATION_JSON,
      CONTENT_TYPES.MULTIPART_FORM_DATA,
    ].includes(requestHeaders['content-type'].split(';')[0]) &&
    !contentType.split(';')[0]?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)
  ) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: `Invalid content type passed`,
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  if (
    !(
      requestHeaders[`x-${POWERED_BY}-config`] ||
      requestHeaders[`x-${POWERED_BY}-provider`]
    )
  ) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: `Either x-${POWERED_BY}-config or x-${POWERED_BY}-provider header is required`,
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
  if (
    requestHeaders[`x-${POWERED_BY}-provider`] &&
    !VALID_PROVIDERS.includes(requestHeaders[`x-${POWERED_BY}-provider`])
  ) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: `Invalid provider passed`,
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  const customHostHeader = requestHeaders[`x-${POWERED_BY}-custom-host`];
  if (customHostHeader && !isValidCustomHost(customHostHeader)) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: `Invalid custom host`,
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  if (requestHeaders[`x-${POWERED_BY}-config`]) {
    try {
      const parsedConfig = JSON.parse(requestHeaders[`x-${POWERED_BY}-config`]);
      if (
        !requestHeaders[`x-${POWERED_BY}-provider`] &&
        !(parsedConfig.provider || parsedConfig.targets)
      ) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: `Either x-${POWERED_BY}-provider needs to be passed. Or the x-${POWERED_BY}-config header should have a valid config with provider details in it.`,
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          }
        );
      }

      const validatedConfig = configSchema.safeParse(parsedConfig);

      if (!validatedConfig.success && validatedConfig.error?.issues?.length) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: `Invalid config passed`,
            errors: validatedConfig.error.issues.map(
              (e: any) => `path: ${e.path}, message: ${e.message}`
            ),
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          }
        );
      }

      if (parsedConfig.options) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: `This version of config is not supported in this route. Please migrate to the latest version`,
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          }
        );
      }
    } catch (e) {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message: `Invalid config passed. You need to pass a valid json`,
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }
  }
  return next();
};

function isValidCustomHost(customHost: string) {
  try {
    const value = customHost.trim().toLowerCase();

    // Block empty or whitespace-only hosts
    if (!value || value.length === 0) return false;

    // Block URLs with control characters or excessive whitespace
    if (/[\x00-\x1F\x7F]/.test(customHost)) return false;

    // Project-specific and obvious disallowed schemes/hosts
    if (value.indexOf('api.portkey') > -1) return false;
    if (value.startsWith('file://')) return false;
    if (value.startsWith('data:')) return false;
    if (value.startsWith('gopher:')) return false;
    if (value.startsWith('ftp://')) return false;
    if (value.startsWith('ftps://')) return false;

    const url = new URL(customHost);
    const protocol = url.protocol.toLowerCase();

    // Allow only HTTP(S)
    if (protocol !== 'http:' && protocol !== 'https:') return false;

    // Disallow credentials and obfuscation
    if (url.username || url.password) return false;
    if (customHost.includes('@')) return false;

    const host = url.hostname.toLowerCase();

    // Block empty hostname
    if (!host || host.length === 0) return false;

    // Block URLs with encoded characters in hostname (potential bypass attempt)
    if (host.includes('%')) return false;

    // Block suspicious characters that might indicate injection attempts
    if (/[\s<>{}|\\^`]/.test(host)) return false;

    // Block trailing dots in hostname (can cause DNS rebinding issues)
    if (host.endsWith('.')) return false;

    // Check against configurable allowed hosts (for local development or trusted domains)
    const isAllowedHost =
      ALLOWED_CUSTOM_HOSTS.has(host) ||
      // Allow subdomains of .localhost
      (ALLOWED_CUSTOM_HOSTS.has('localhost') && host.endsWith('.localhost'));

    if (isAllowedHost) {
      // Still validate port range if provided
      if (url.port) {
        const p = parseInt(url.port, 10);
        if (!(p > 0 && p <= 65535)) return false;
      }
      return true;
    }

    // Block obvious internal/unsafe hosts and cloud metadata endpoints
    const blockedHosts = [
      '0.0.0.0',
      '169.254.169.254', // AWS, Azure, GCP metadata (IPv4)
      'metadata.google.internal', // GCP metadata
      'metadata', // Kubernetes metadata
      'metadata.azure.com', // Azure instance metadata
      'instance-data', // AWS instance metadata alt
    ];
    if (blockedHosts.includes(host)) {
      return false;
    }

    // Block AWS IMDSv2 endpoint variations
    if (host.startsWith('169.254.169.') || host.startsWith('fd00:ec2::')) {
      return false;
    }

    // Block internal/special-use TLDs often used in SSRF attempts
    const blockedTlds = [
      '.local',
      '.localdomain',
      '.internal',
      '.intranet',
      '.lan',
      '.home',
      '.corp',
      '.test',
      '.invalid',
      '.onion',
      '.localhost', // Block nested localhost subdomains for non-exact matches
    ];
    if (blockedTlds.some((tld) => host.endsWith(tld) && host !== 'localhost')) {
      return false;
    }

    // Block private/reserved IPs (IPv4)
    if (isIPv4(host)) {
      if (isPrivateIPv4(host) || isReservedIPv4(host)) return false;
    }

    // Check for alternative IP representations (decimal, hex, octal)
    if (isAlternativeIPRepresentation(host)) return false;

    // Block private/reserved IPv6 and IPv4-mapped IPv6
    if (host.includes(':')) {
      if (isLocalOrPrivateIPv6(host)) return false;
      const mapped = host.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
      if (mapped) {
        const ip4 = mapped[1];
        if (isPrivateIPv4(ip4) || isReservedIPv4(ip4)) return false;
      }
      // Also check for other IPv4-embedded IPv6 formats
      const embeddedIPv4 = host.match(/::(\d{1,3}(?:\.\d{1,3}){3})$/i);
      if (embeddedIPv4) {
        const ip4 = embeddedIPv4[1];
        if (isPrivateIPv4(ip4) || isReservedIPv4(ip4)) return false;
      }
    }

    // Validate port if present
    if (url.port) {
      const p = parseInt(url.port, 10);
      if (!(p > 0 && p <= 65535)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function isIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    // Must be 1-3 digits
    if (!/^\d{1,3}$/.test(part)) return false;

    const num = Number(part);

    // Must be in range 0-255
    if (num < 0 || num > 255) return false;

    // Reject leading zeros (except for "0" itself)
    // This prevents octal interpretation ambiguity
    if (part.length > 1 && part.startsWith('0')) return false;

    return true;
  });
}

function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map((n) => Number(n));
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}

function inRange(ip: string, start: string, end: string): boolean {
  const x = ipv4ToInt(ip);
  return x >= ipv4ToInt(start) && x <= ipv4ToInt(end);
}

function isPrivateIPv4(ip: string): boolean {
  return (
    inRange(ip, '10.0.0.0', '10.255.255.255') || // 10/8
    inRange(ip, '172.16.0.0', '172.31.255.255') || // 172.16/12
    inRange(ip, '192.168.0.0', '192.168.255.255') // 192.168/16
  );
}

function isReservedIPv4(ip: string): boolean {
  return (
    inRange(ip, '127.0.0.0', '127.255.255.255') || // loopback
    inRange(ip, '169.254.0.0', '169.254.255.255') || // link-local
    inRange(ip, '100.64.0.0', '100.127.255.255') || // CGNAT
    inRange(ip, '0.0.0.0', '0.255.255.255') || // "this" network
    inRange(ip, '224.0.0.0', '255.255.255.255') // multicast/reserved/broadcast
  );
}

function isLocalOrPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback/unspecified
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 (ULA)
  if (h.startsWith('fe80')) return true; // fe80::/10 (link-local)
  if (h.startsWith('fec0')) return true; // fec0::/10 (site-local, deprecated)
  return false;
}

function isAlternativeIPRepresentation(host: string): boolean {
  // Check for decimal IP (e.g., 2130706433 for 127.0.0.1)
  // Valid range: 0 to 4294967295 (2^32 - 1)
  if (/^\d{1,10}$/.test(host)) {
    const num = parseInt(host, 10);
    if (num >= 0 && num <= 0xffffffff) {
      // Convert to dotted decimal and check if it's private/reserved
      const a = (num >>> 24) & 0xff;
      const b = (num >>> 16) & 0xff;
      const c = (num >>> 8) & 0xff;
      const d = num & 0xff;
      const ip = `${a}.${b}.${c}.${d}`;
      // Block if it resolves to a private or reserved IP
      if (isPrivateIPv4(ip) || isReservedIPv4(ip)) return true;
      // Also block public IPs in decimal format to prevent confusion
      return true;
    }
  }

  // Check for hex IP (e.g., 0x7f000001 for 127.0.0.1)
  if (/^0x[0-9a-f]{1,8}$/i.test(host)) {
    const num = parseInt(host, 16);
    if (num >= 0 && num <= 0xffffffff) {
      const a = (num >>> 24) & 0xff;
      const b = (num >>> 16) & 0xff;
      const c = (num >>> 8) & 0xff;
      const d = num & 0xff;
      const ip = `${a}.${b}.${c}.${d}`;
      return true; // Block all hex IPs
    }
  }

  // Check for octal IP parts (e.g., 0177.0.0.1 for 127.0.0.1)
  const parts = host.split('.');
  if (parts.length === 4 && parts.some((p) => /^0\d+$/.test(p))) {
    // Has octal notation - block it
    return true;
  }

  // Check for mixed hex notation (e.g., 0x7f.0.0.1)
  if (parts.length === 4 && parts.some((p) => /^0x[0-9a-f]+$/i.test(p))) {
    // Has hex notation - block it
    return true;
  }

  // Check for shortened IP formats (e.g., 127.1 -> 127.0.0.1)
  if (parts.length >= 2 && parts.length < 4) {
    if (parts.every((p) => /^\d+$/.test(p) && Number(p) <= 255)) {
      // Looks like a shortened IP format - block it
      return true;
    }
  }

  return false;
}
