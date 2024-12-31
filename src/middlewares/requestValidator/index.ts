import { Context } from 'hono';
import { CONTENT_TYPES, POWERED_BY, VALID_PROVIDERS } from '../../globals';
import { configSchema } from './schema/config';
import Providers from '../../providers';

const providers = Object.keys(Providers);

export const requestValidator = async (c: Context, next: any) => {
  const requestHeaders = Object.fromEntries(c.req.raw.headers);
  const clonedReq = c.req.raw.clone();
  if (clonedReq.method === 'GET') {
    const provider = new URLSearchParams(new URL(clonedReq.url).search).get(
      'provider'
    );
    if (provider && providers.includes(provider)) {
      requestHeaders[`x-${POWERED_BY}-provider`] = provider;
      const newHeaders = new Headers(requestHeaders);
      const newRequest = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: newHeaders,
      });

      c.req.raw = newRequest;
    }
  } else {
    const originalBody = await clonedReq.text();
    const modifiedBody = JSON.parse(originalBody);
    const [provider, ...modelNames] = modifiedBody.model.split(':');
    if (providers.includes(provider)) {
      requestHeaders[`x-${POWERED_BY}-provider`] = provider;
      modifiedBody.model = modelNames.join(':') || undefined;
      const newHeaders = new Headers(requestHeaders);
      const newRequest = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: newHeaders,
        body: JSON.stringify(modifiedBody),
      });

      c.req.raw = newRequest;
    }
  }

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
  if (customHostHeader && customHostHeader.indexOf('api.portkey') > -1) {
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
  return await next();
};
