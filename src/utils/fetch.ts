import { Agent } from 'undici';

/**
 * Creates a custom HTTPS agent with SSL configuration options
 *
 * @param options - Configuration options for the HTTPS agent
 * @param options.rejectUnauthorized - Whether to reject unauthorized certificates (default: true)
 * @param options.ca - Custom CA certificate (optional)
 * @returns HTTPS Agent instance
 */
export function getCustomHttpsAgent(
  options: {
    rejectUnauthorized?: boolean;
    ca?: string | Buffer;
  } = {}
): Agent {
  const { rejectUnauthorized = true, ca } = options || {};

  return new Agent({
    connect: {
      rejectUnauthorized,
      ...(ca && { ca }),
    },
  });
}
