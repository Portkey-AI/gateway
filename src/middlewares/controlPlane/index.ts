import { Context } from 'hono';
import { env } from 'hono/adapter';

async function pkFetch(
  c: Context,
  path: string,
  method: string = 'GET',
  headers: any = {},
  body: any = {}
) {
  // FOR TESTING ONLY
  if (path.includes('/mcp-servers/')) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          url: 'https://mcp.linear.app/mcp',
          name: 'My Linear',
          auth_type: 'oauth_auto',
        }),
    };
  }

  const controlPlaneUrl = env(c).ALBUS_BASEPATH;
  let options: any = {
    method,
    headers: {
      ...headers,
      'User-Agent': 'Portkey-MCP-Gateway/0.1.0',
      'Content-Type': 'application/json',
      'x-client-id-gateway': env(c).CLIENT_ID,
    },
  };
  if (method === 'POST') {
    options.body = body;
  }
  const response = await fetch(`${controlPlaneUrl}${path}`, options);
  return response;
}

export { pkFetch };
