import { GatewayError } from '../../errors/GatewayError';

// Allowlist of characters safe to interpolate into a URL hostname or path
// segment. Rejects URL parser directives (#, /, ?, @, :, %, \), whitespace,
// and control characters. Prevents fragment-injection SSRF where a value like
// "evil.com#" rewrites the effective hostname when templated into a URL.
const SAFE_URL_COMPONENT = /^[a-zA-Z0-9._-]+$/;
const MAX_COMPONENT_LENGTH = 253;

export function assertSafeUrlComponent(
  field: string,
  value: string | undefined | null
): void {
  if (!value) return;
  if (value.length > MAX_COMPONENT_LENGTH) {
    throw new GatewayError(
      `Invalid ${field}: exceeds ${MAX_COMPONENT_LENGTH} characters`,
      400
    );
  }
  if (!SAFE_URL_COMPONENT.test(value)) {
    throw new GatewayError(
      `Invalid ${field}: contains disallowed characters`,
      400
    );
  }
}

// Egress safety check: after a provider constructs the final fetch URL, parse
// it and reject any URL-parser surprises that indicate injected control chars
// reached the request (fragment, userinfo). This is a belt-and-suspenders
// check; individual providers should validate inputs before interpolation.
export function assertSafeRequestUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GatewayError(`Invalid request URL`, 400);
  }
  if (parsed.hash) {
    throw new GatewayError(`Invalid request URL: fragment not permitted`, 400);
  }
  if (parsed.username || parsed.password) {
    throw new GatewayError(
      `Invalid request URL: credentials in URL not permitted`,
      400
    );
  }
}
