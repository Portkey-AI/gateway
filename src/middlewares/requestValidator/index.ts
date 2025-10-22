import { Context } from 'hono';
import { CONTENT_TYPES, POWERED_BY, VALID_PROVIDERS } from '../../globals';
import { configSchema } from './schema/config';

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

    // Project-specific and obvious disallowed schemes/hosts
    if (value.indexOf('api.portkey') > -1) return false;
    if (value.startsWith('file://')) return false;
    if (value.startsWith('data:')) return false;
    if (value.startsWith('gopher:')) return false;

    const url = new URL(customHost);
    const protocol = url.protocol.toLowerCase();

    // Allow only HTTP(S)
    if (protocol !== 'http:' && protocol !== 'https:') return false;

    // Disallow credentials and obfuscation
    if (url.username || url.password) return false;
    if (customHost.includes('@')) return false;

    const host = url.hostname.toLowerCase();

    // Lenient allowance for local development
    const localAllow =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === 'host.docker.internal';
    if (localAllow) {
      // Still validate port range if provided
      if (url.port) {
        const p = parseInt(url.port, 10);
        if (!(p > 0 && p <= 65535)) return false;
      }
      return true;
    }

    // Block obvious internal/unsafe hosts
    if (
      host === '0.0.0.0' ||
      host === '169.254.169.254' // cloud metadata
    ) {
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
    ];
    if (blockedTlds.some((tld) => host.endsWith(tld))) return false;

    // Block private/reserved IPs (IPv4)
    if (isIPv4(host)) {
      if (isPrivateIPv4(host) || isReservedIPv4(host)) return false;
    }

    // Block private/reserved IPv6 and IPv4-mapped IPv6
    if (host.includes(':')) {
      if (isLocalOrPrivateIPv6(host)) return false;
      const mapped = host.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
      if (mapped) {
        const ip4 = mapped[1];
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
  return parts.every(
    (p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255
  );
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
