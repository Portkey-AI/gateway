// External example middleware - simplified version for proof of concept
import { Context } from 'hono';

export const middleware = async (c: Context, next: any) => {
  const startTime = Date.now();
  const method = c.req.method;
  const url = c.req.url;

  // Log incoming request
  console.log(
    `🔷 [External Logger] Incoming request: ${method} ${url.split(':')[1] || url}`
  );

  // Call next middleware
  await next();

  // Log outgoing response
  const duration = Date.now() - startTime;
  console.log(
    `🔷 [External Logger] Response sent: ${c.res.status} (${duration}ms)`
  );
};

export const metadata = {
  name: 'loggerExternal',
  description: 'External logger middleware example',
  pattern: '*',
};
