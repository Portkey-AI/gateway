/**
 * Rubeus (Hard)worker
 *
 * @module index
 */

import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { HTTPException } from "hono/http-exception";
// import { env } from 'hono/adapter' // Have to set this up for multi-environment deployment

import { completeHandler } from "./handlers/completeHandler";
import { chatCompleteHandler } from "./handlers/chatCompleteHandler";
import { embedHandler } from "./handlers/embedHandler";
import { proxyHandler } from "./handlers/proxyHandler";

// Create a new Hono server instance
const app = new Hono();

/**
 * GET route for the root path.
 * Returns a greeting message.
 */
app.get("/", (c) => c.text("Rubeus says hey!"));

// Use prettyJSON middleware for all routes
app.use("*", prettyJSON());

/**
 * Default route when no other route matches.
 * Returns a JSON response with a message and status code 404.
 */
app.notFound((c) => c.json({ message: "Not Found", ok: false }, 404));

/**
 * Global error handler.
 * If error is instance of HTTPException, returns the custom response.
 * Otherwise, logs the error and returns a JSON response with status code 500.
 */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  c.status(500);
  return c.json({ ok: false, message: err.message });
});

/**
 * POST route for '/v1/complete'.
 * Handles requests by passing them to the completeHandler.
 * If an error occurs, it throws an HTTPException with status code 500.
 */
app.post("/v1/complete", async (c) => {
  try {
    let cjson = await c.req.json();
    let cheaders = Object.fromEntries(c.req.headers);
    return await completeHandler(c, c.env, cjson, cheaders);
  } catch (err: any) {
    throw new HTTPException(err.status, {
      res: new Response(err.errorObj, {
        status: err.status,
        headers: {
          "content-type": "application/json",
        },
      }),
    });
  }
});

/**
 * POST route for '/v1/chatComplete'.
 * Handles requests by passing them to the chatCompleteHandler.
 * If an error occurs, it throws an HTTPException with status code 500.
 */
app.post("/v1/chatComplete", async (c) => {
  try {
    let cjson = await c.req.json();
    let cheaders = Object.fromEntries(c.req.headers);
    return await chatCompleteHandler(c, c.env, cjson, cheaders);
  } catch (err: any) {
    throw new HTTPException(err.status, {
      res: new Response(err.errorObj, {
        status: err.status,
        headers: {
          "content-type": "application/json",
        },
      }),
    });
  }
});

/**
 * POST route for '/v1/embed'.
 * Handles requests by passing them to the embedHandler.
 * If an error occurs, it throws an HTTPException with status code 500.
 */
app.post("/v1/embed", async (c) => {
  try {
    let cjson = await c.req.json();
    let cheaders = Object.fromEntries(c.req.headers);
    return await embedHandler(c, c.env, cjson, cheaders);
  } catch (err: any) {
    throw new HTTPException(err.status, {
      res: new Response(err.errorObj, {
        status: err.status,
        headers: {
          "content-type": "application/json",
        },
      }),
    });
  }
});

app.post("/v1/proxy/*", async (c) => {
  try {
    const resp = await proxyHandler(c, c.env, c.req);

    return resp;
  } catch (err: any) {
    throw new HTTPException(err.status, {
      res: new Response(err.errorObj, {
        status: err.status,
        headers: {
          "content-type": "application/json",
        },
      }),
    });
  }
});

// Export the app
export default app;
