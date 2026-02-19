declare module '@hono/node-server/dist/types' {
  import type {
    IncomingMessage,
    ServerResponse,
    Server,
    ServerOptions as HttpServerOptions,
    createServer,
  } from 'node:http';
  import type {
    Http2ServerRequest,
    Http2ServerResponse,
    Http2Server,
    Http2SecureServer,
    ServerOptions as Http2ServerOptions,
    createServer as createServer2,
    SecureServerOptions,
    createSecureServer,
  } from 'node:http2';
  import type {
    ServerOptions as HttpsServerOptions,
    createServer as createServer1,
  } from 'node:https';

  export type HttpBindings = {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };

  export type Http2Bindings = {
    incoming: Http2ServerRequest;
    outgoing: Http2ServerResponse;
  };

  export type FetchCallback = (
    request: Request,
    env: HttpBindings | Http2Bindings
  ) => Promise<unknown> | unknown;

  export type NextHandlerOption = {
    fetch: FetchCallback;
  };

  export type ServerType = Server | Http2Server | Http2SecureServer;

  type createHttpOptions = {
    serverOptions?: HttpServerOptions;
    createServer?: typeof createServer;
  };

  type createHttpsOptions = {
    serverOptions?: HttpsServerOptions;
    createServer?: typeof createServer1;
  };

  type createHttp2Options = {
    serverOptions?: Http2ServerOptions;
    createServer?: typeof createServer2;
  };

  type createSecureHttp2Options = {
    serverOptions?: SecureServerOptions;
    createServer?: typeof createSecureServer;
  };

  type ServerOptions =
    | createHttpOptions
    | createHttpsOptions
    | createHttp2Options
    | createSecureHttp2Options;

  export type Options = {
    fetch: FetchCallback;
    overrideGlobalObjects?: boolean;
    port?: number;
    hostname?: string;
  } & ServerOptions;

  export type CustomErrorHandler = (
    err: unknown
  ) => void | Response | Promise<void | Response>;
}
