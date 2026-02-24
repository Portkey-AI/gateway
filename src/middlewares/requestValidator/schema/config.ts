import { z } from 'zod';
import {
  AZURE_OPEN_AI,
  OLLAMA,
  VALID_PROVIDERS,
  GOOGLE_VERTEX_AI,
  TRITON,
} from '../../../globals';
import { Context } from 'hono';
import { Environment } from '../../../utils/env';
import { env } from 'hono/adapter';

// Regex patterns for validation (defined once for reusability)
const VALIDATION_PATTERNS = {
  CONTROL_CHARS: /[\x00-\x1F\x7F]/, // eslint-disable-line no-control-regex
  SUSPICIOUS_CHARS: /[\s<>{}|\\^`]/,
  DIGITS_1_3: /^\d{1,3}$/,
  DIGITS_1_10: /^\d{1,10}$/,
  DIGITS_ONLY: /^\d+$/,
  HEX_IP: /^0x[0-9a-f]{1,8}$/i,
  ALTERNATIVE_IP_PART: /^0[0-9a-fx]/i, // Starts with 0 followed by digits or x (octal or hex)
  IPV6_MAPPED_IPV4: /::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i,
  IPV6_EMBEDDED_IPV4: /::(\d{1,3}(?:\.\d{1,3}){3})$/i,
  HOMOGRAPH_ATTACK: /^[a-z0-9.-]+$/,
};

// Disallowed URL schemes
const DISALLOWED_SCHEMES = ['file://', 'data:', 'gopher:', 'ftp://', 'ftps://'];

// Blocked hosts (cloud metadata endpoints and internal IPs)
const BLOCKED_HOSTS = [
  '0.0.0.0',
  '169.254.169.254', // AWS, Azure, GCP metadata (IPv4)
  'metadata.google.internal', // GCP metadata
  'metadata', // Kubernetes metadata
  'metadata.azure.com', // Azure instance metadata
  'instance-data', // AWS instance metadata alt
];

// Blocked TLDs for SSRF protection
const BLOCKED_TLDS = [
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
  '.localhost',
];

// Parse allowed custom hosts from environment variable
// Format: comma-separated list of domains/IPs (e.g., "localhost,127.0.0.1,example.com")
const TRUSTED_CUSTOM_HOSTS = (c?: Context) => {
  const envVar = Environment(c ? env(c) : {}).TRUSTED_CUSTOM_HOSTS;
  if (!envVar) {
    // Default allowed hosts for local development
    return new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
  }
  return new Set(
    envVar
      .split(',')
      .map((h: string) => h.trim().toLowerCase())
      .filter((h: string) => h.length > 0)
  );
};

// Pre-computed IPv4 range boundaries for performance optimization
const IPV4_RANGES = {
  PRIVATE: [
    { start: ipv4ToInt('10.0.0.0'), end: ipv4ToInt('10.255.255.255') }, // 10/8
    { start: ipv4ToInt('172.16.0.0'), end: ipv4ToInt('172.31.255.255') }, // 172.16/12
    { start: ipv4ToInt('192.168.0.0'), end: ipv4ToInt('192.168.255.255') }, // 192.168/16
  ],
  RESERVED: [
    { start: ipv4ToInt('127.0.0.0'), end: ipv4ToInt('127.255.255.255') }, // loopback
    { start: ipv4ToInt('169.254.0.0'), end: ipv4ToInt('169.254.255.255') }, // link-local
    { start: ipv4ToInt('100.64.0.0'), end: ipv4ToInt('100.127.255.255') }, // CGNAT
    { start: ipv4ToInt('0.0.0.0'), end: ipv4ToInt('0.255.255.255') }, // "this" network
    { start: ipv4ToInt('224.0.0.0'), end: ipv4ToInt('255.255.255.255') }, // multicast/reserved/broadcast
  ],
};

export const configSchema: any = z
  .object({
    strategy: z
      .object({
        mode: z
          .string()
          .refine(
            (value) =>
              ['single', 'loadbalance', 'fallback', 'conditional'].includes(
                value
              ),
            {
              message:
                "Invalid 'mode' value. Must be one of: single, loadbalance, fallback, conditional",
            }
          ),
        on_status_codes: z.array(z.number()).optional(),
        conditions: z
          .array(
            z.object({
              query: z.object({}),
              then: z.string(),
            })
          )
          .optional(),
        default: z.string().optional(),
        sticky: z
          .object({
            enabled: z.boolean(),
            hash_fields: z
              .array(
                z
                  .string()
                  .refine(
                    (val) =>
                      val.startsWith('metadata.') ||
                      val.startsWith('params.') ||
                      val.startsWith('headers.'),
                    {
                      message:
                        'hash_fields must start with "metadata.", "params.", or "headers."',
                    }
                  )
              )
              .optional(),
            ttl: z.number().positive().optional(),
          })
          .optional(),
      })
      .optional(),
    provider: z
      .string()
      .refine((value) => VALID_PROVIDERS.includes(value), {
        message: `Invalid 'provider' value. Must be one of: ${VALID_PROVIDERS.join(
          ', '
        )}`,
      })
      .optional(),
    api_key: z.string().optional(),
    aws_secret_access_key: z.string().optional(),
    aws_access_key_id: z.string().optional(),
    aws_session_token: z.string().optional(),
    aws_region: z.string().optional(),
    cache: z
      .object({
        mode: z
          .string()
          .refine((value) => ['simple', 'semantic'].includes(value), {
            message:
              "Invalid 'cache.mode' value. Must be one of: simple, semantic",
          }),
        max_age: z.number().optional(),
      })
      .refine((value) => value.mode !== undefined, {
        message: "'cache.mode' must be defined",
      })
      .optional(),
    retry: z
      .object({
        attempts: z.number(),
        on_status_codes: z.array(z.number()).optional(),
        use_retry_after_header: z.boolean().optional(),
      })
      .refine((value) => value.attempts !== undefined, {
        message: "'retry.attempts' must be defined",
      })
      .optional(),
    weight: z.number().optional(),
    on_status_codes: z.array(z.number()).optional(),
    targets: z.array(z.lazy(() => configSchema)).optional(),
    request_timeout: z.number().optional(),
    custom_host: z.string().optional(),
    forward_headers: z.array(z.string()).optional(),
    // Google Vertex AI specific
    vertex_project_id: z.string().optional(),
    vertex_region: z.string().optional(),
    after_request_hooks: z
      .array(z.object({}).catchall(z.any())) // Allows any object structure
      .optional(),
    before_request_hooks: z
      .array(z.object({}).catchall(z.any())) // Allows any object structure
      .optional(),
    input_guardrails: z
      .union([
        z.array(z.string()),
        z.array(
          z.object({}).catchall(z.any()) // Allows any object structure
        ),
      ])
      .optional(),
    output_guardrails: z
      .union([
        z.array(z.string()),
        z.array(
          z.object({}).catchall(z.any()) // Allows any object structure
        ),
      ])
      .optional(),
    vertex_service_account_json: z.object({}).catchall(z.string()).optional(),
    // OpenAI specific
    openai_project: z.string().optional(),
    openai_organization: z.string().optional(),
    // Azure specific
    azure_auth_mode: z.string().optional(),
    azure_entra_client_id: z.string().optional(),
    azure_entra_client_secret: z.string().optional(),
    azure_entra_tenant_id: z.string().optional(),
    deployment_id: z.string().optional(),
    api_version: z.string().optional(),
    azure_ad_token: z.string().optional(),
    azure_model_name: z.string().optional(),
    strict_open_ai_compliance: z.boolean().optional(),
  })
  .refine(
    (value) => {
      const hasProviderApiKey =
        value.provider !== undefined && value.api_key !== undefined;
      const hasModeTargets =
        value.strategy !== undefined && value.targets !== undefined;
      const isOllamaProvider = value.provider === OLLAMA;
      const isTritonProvider = value.provider === TRITON;
      const isVertexAIProvider =
        value.provider === GOOGLE_VERTEX_AI &&
        value.vertex_region &&
        (value.vertex_service_account_json || value.vertex_project_id);
      const hasAWSDetails =
        value.aws_access_key_id && value.aws_secret_access_key;
      const isAzureProvider =
        value.provider === AZURE_OPEN_AI &&
        (value.api_key || value.azure_ad_token);

      return (
        hasProviderApiKey ||
        hasModeTargets ||
        value.cache ||
        value.retry ||
        value.request_timeout ||
        isOllamaProvider ||
        isTritonProvider ||
        hasAWSDetails ||
        isVertexAIProvider ||
        isAzureProvider ||
        value.after_request_hooks ||
        value.before_request_hooks ||
        value.input_guardrails ||
        value.output_guardrails
      );
    },
    {
      message:
        "Invalid configuration. It must have either 'provider' and 'api_key', or 'strategy' and 'targets', or 'cache', or 'retry', or 'request_timeout'",
    }
  )
  .refine(
    (value) => {
      const customHost = value.custom_host;
      if (customHost && !isValidCustomHost(customHost)) {
        return false;
      }
      return true;
    },
    {
      message: 'Invalid custom host',
    }
  )
  // Validate Google Vertex AI specific fields
  .refine(
    (value) => {
      const isGoogleVertexAIProvider = value.provider === GOOGLE_VERTEX_AI;
      const hasGoogleVertexAIFields =
        (value.vertex_project_id && value.vertex_region) ||
        (value.vertex_region && value.vertex_service_account_json);
      return !(isGoogleVertexAIProvider && !hasGoogleVertexAIFields);
    },
    {
      message: `Invalid configuration. ('vertex_project_id' and 'vertex_region') or ('vertex_service_account_json' and 'vertex_region') are required for '${GOOGLE_VERTEX_AI}' provider. Example: { 'provider': 'vertex-ai', 'vertex_project_id': 'my-project-id', 'vertex_region': 'us-central1', api_key: 'ya29...' }`,
    }
  );

export function isValidCustomHost(customHost: string, c?: Context) {
  try {
    const value = customHost.trim().toLowerCase();

    // Block empty or whitespace-only hosts
    if (!value) return false;

    // Block URLs with control characters or excessive whitespace
    if (VALIDATION_PATTERNS.CONTROL_CHARS.test(customHost)) return false;

    // Project-specific and obvious disallowed schemes/hosts
    if (value.indexOf('api.portkey') > -1) return false;
    if (DISALLOWED_SCHEMES.some((scheme) => value.startsWith(scheme)))
      return false;

    const url = new URL(customHost);
    const protocol = url.protocol;

    // Allow only HTTP(S)
    if (protocol !== 'http:' && protocol !== 'https:') return false;

    // Disallow credentials and obfuscation
    if (url.username || url.password) return false;
    if (customHost.includes('@')) return false;

    const host = url.hostname;

    // Block empty hostname
    if (!host) return false;

    // Block URLs with encoded characters in hostname (potential bypass attempt)
    if (host.includes('%')) return false;

    // Block suspicious characters that might indicate injection attempts
    if (VALIDATION_PATTERNS.SUSPICIOUS_CHARS.test(host)) return false;

    // Block non-ASCII characters in hostname (homograph attack protection)
    // Prevents Unicode lookalike characters from spoofing legitimate domains
    if (!VALIDATION_PATTERNS.HOMOGRAPH_ATTACK.test(host)) return false;

    // Block trailing dots in hostname (can cause DNS rebinding issues)
    if (host.endsWith('.')) return false;

    // Split hostname once for reuse in multiple checks
    const hostParts = host.split('.');

    // Block excessive subdomain depth (potential DNS rebinding attack)
    // Limits the number of labels to prevent abuse
    if (hostParts.length > 10) return false;

    const trustedHosts = TRUSTED_CUSTOM_HOSTS(c);
    // Check against configurable allowed hosts (for local development or trusted domains)
    const isTrustedHost =
      trustedHosts.has(host) ||
      // Allow subdomains of .localhost
      (trustedHosts.has('localhost') && host.endsWith('.localhost'));

    if (isTrustedHost) {
      // Still validate port range if provided
      if (url.port && !isValidPort(url.port)) return false;
      return true;
    }

    // Block obvious internal/unsafe hosts and cloud metadata endpoints
    if (BLOCKED_HOSTS.includes(host)) return false;

    // Block AWS IMDSv2 endpoint variations
    if (host.startsWith('169.254.169.') || host.startsWith('fd00:ec2::')) {
      return false;
    }

    // Block internal/special-use TLDs often used in SSRF attempts
    if (
      BLOCKED_TLDS.some((tld) => host.endsWith(tld) && host !== 'localhost')
    ) {
      return false;
    }

    // Block private/reserved IPs (IPv4)
    if (isIPv4(hostParts) && (isPrivateIPv4(host) || isReservedIPv4(host))) {
      return false;
    }

    // Check for alternative IP representations (decimal, hex, octal)
    if (isAlternativeIPRepresentation(host, hostParts)) return false;

    // Block private/reserved IPv6 and IPv4-mapped IPv6
    if (host.includes(':')) {
      if (isLocalOrPrivateIPv6(host)) return false;

      // Check both IPv6-mapped and embedded IPv4 patterns
      const ipv4Match =
        host.match(VALIDATION_PATTERNS.IPV6_MAPPED_IPV4) ||
        host.match(VALIDATION_PATTERNS.IPV6_EMBEDDED_IPV4);

      if (ipv4Match) {
        const ip4 = ipv4Match[1];
        if (isPrivateIPv4(ip4) || isReservedIPv4(ip4)) return false;
      }
    }

    // Validate port if present
    if (url.port && !isValidPort(url.port)) return false;

    return true;
  } catch {
    return false;
  }
}

// Helper function to convert integer to IPv4 dotted decimal notation
function intToIPv4(num: number): string {
  const a = (num >>> 24) & 0xff;
  const b = (num >>> 16) & 0xff;
  const c = (num >>> 8) & 0xff;
  const d = num & 0xff;
  return `${a}.${b}.${c}.${d}`;
}

// Helper function to convert IPv4 dotted decimal to integer
function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map((n) => Number(n));
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}

// Helper function to validate port numbers
function isValidPort(port: string): boolean {
  const p = parseInt(port, 10);
  return p > 0 && p <= 65535;
}

function isIPv4(parts: string[]): boolean {
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    // Must be 1-3 digits
    if (!VALIDATION_PATTERNS.DIGITS_1_3.test(part)) return false;

    const num = Number(part);

    // Must be in range 0-255
    if (num < 0 || num > 255) return false;

    // Reject leading zeros (except for "0" itself)
    // This prevents octal interpretation ambiguity
    if (part.length > 1 && part.startsWith('0')) return false;

    return true;
  });
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return IPV4_RANGES.PRIVATE.some(
    (range) => ipInt >= range.start && ipInt <= range.end
  );
}

function isReservedIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return IPV4_RANGES.RESERVED.some(
    (range) => ipInt >= range.start && ipInt <= range.end
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

function isAlternativeIPRepresentation(host: string, parts: string[]): boolean {
  // Check for decimal IP (e.g., 2130706433 for 127.0.0.1)
  // Valid range: 0 to 4294967295 (2^32 - 1)
  if (VALIDATION_PATTERNS.DIGITS_1_10.test(host)) {
    const num = parseInt(host, 10);
    if (num >= 0 && num <= 0xffffffff) {
      // Convert to dotted decimal and check if it's private/reserved
      const ip = intToIPv4(num);
      // Block if it resolves to a private or reserved IP
      if (isPrivateIPv4(ip) || isReservedIPv4(ip)) return true;
      // Also block public IPs in decimal format to prevent confusion
      return true;
    }
  }

  // Check for hex IP (e.g., 0x7f000001 for 127.0.0.1)
  if (VALIDATION_PATTERNS.HEX_IP.test(host)) {
    const num = parseInt(host, 16);
    if (num >= 0 && num <= 0xffffffff) {
      return true; // Block all hex IPs (no need to convert)
    }
  }

  // Check for octal or hex notation in any part (e.g., 0177.0.0.1 or 0x7f.0.0.1)
  if (
    parts.length >= 2 &&
    parts.length < 4 &&
    parts.every(
      (p) => VALIDATION_PATTERNS.DIGITS_ONLY.test(p) && Number(p) <= 255
    ) &&
    parts.join('.') === host // Ensure the host is only digits and dots
  ) {
    // Has octal or hex notation - block it
    return true;
  }

  // Check for shortened IP formats (e.g., 127.1 -> 127.0.0.1)
  if (parts.length >= 2 && parts.length < 4) {
    if (
      parts.every(
        (p) => VALIDATION_PATTERNS.DIGITS_ONLY.test(p) && Number(p) <= 255
      )
    ) {
      // Looks like a shortened IP format - block it
      return true;
    }
  }

  return false;
}
