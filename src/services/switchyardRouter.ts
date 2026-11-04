import type {
  AlgorithmRouter,
  TargetFormat,
  WireFormat,
} from '@switchyard/libsy';
import type { Context } from 'hono';
import { RouterError } from '../errors/RouterError';
import { HEADER_KEYS } from '../globals';
import { ContextKeys, getContext } from '../middlewares/portkey/contextHelpers';
import { PORTKEY_HEADER_KEYS } from '../middlewares/portkey/globals';
import type { endpointStrings } from '../providers/types';
import type { Params, Targets } from '../types/requestBody';

const routers = new Map<string, AlgorithmRouter>();
const routerLimit = 64;
const calls: Record<TargetFormat, { endpoint: endpointStrings; path: string }> =
  {
    openai_chat: { endpoint: 'chatComplete', path: '/v1/chat/completions' },
    openai_responses: {
      endpoint: 'createModelResponse',
      path: '/v1/responses',
    },
    anthropic_messages: { endpoint: 'messages', path: '/v1/messages' },
    openai_decisions: { endpoint: 'proxy', path: '/v1/decisions' },
    system_one: { endpoint: 'proxy', path: '/v1/systemone' },
  };

function routingError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ status: 'failure', message }), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-portkey-gateway-exception': 'true',
    },
  });
}

// Native continuation state is private to the resolved tenant, API key and provider configuration.
async function routerKey(
  c: Context,
  group: Targets,
  requestHeaders: Record<string, string>
): Promise<string> {
  const organisation = getContext(c, ContextKeys.ORGANISATION_DETAILS)!;
  const forwarded = new Set(
    (
      requestHeaders[HEADER_KEYS.FORWARD_HEADERS]?.split(',') ??
      [group, ...(group.targets ?? [])].flatMap(
        (target) =>
          (target as Targets & { forwardHeaders?: string[] }).forwardHeaders ??
          []
      )
    ).map((name) => name.trim().toLowerCase())
  );
  const providerHeaders = Object.fromEntries(
    Object.entries(requestHeaders).filter(
      ([name]) =>
        forwarded.has(name) ||
        ['authorization', 'x-api-key', 'api-key'].includes(name)
    )
  );
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify({
        group,
        organisationId: organisation.id,
        workspaceId: organisation.workspaceDetails.id,
        apiKeyId: organisation.apiKeyDetails.id,
        apiKey: organisation.apiKeyDetails.key,
        userId: organisation.apiKeyDetails.userId,
        providerHeaders,
        customHost: requestHeaders[HEADER_KEYS.CUSTOM_HOST],
        forwardHeaders: requestHeaders[HEADER_KEYS.FORWARD_HEADERS],
      })
    )
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

// Keep authentication and services shared; isolate each call's request and response logs.
function callContext(
  c: Context,
  format: TargetFormat,
  body: Params,
  signal: AbortSignal,
  cacheScope: string,
  requestHeaders: Record<string, string>
): Context {
  const url = new URL(c.req.url);
  url.pathname = calls[format].path;
  url.search = '';
  const headers = new Headers(requestHeaders);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  if (calls[format].endpoint === 'proxy') {
    // Proxy forwarding must not overwrite the resolved target's provider credentials.
    for (const name of ['authorization', 'x-api-key', 'api-key'])
      headers.delete(name);
  }
  // Hono exports Context only as a type; use the active context's constructor.
  const ContextConstructor = c.constructor as new (
    request: Request,
    options: { env: Context['env']; path: string }
  ) => Context;
  const child = new ContextConstructor(
    new Request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    }),
    { env: c.env, path: url.pathname }
  );
  const values = new Map<string, any>([
    ['requestOptions', []],
    ['switchyardSignal', signal],
    ['switchyardCall', true],
    ['headersObj', Object.fromEntries(headers)],
    [ContextKeys.MAPPED_HEADERS, Object.fromEntries(headers)],
    [
      ContextKeys.REQUEST_BODY_DATA,
      {
        bodyJSON: body,
        bodyFormData: null,
        requestBinary: null,
      },
    ],
  ]);
  const getFromCache = c.get('getFromCache');
  if (getFromCache) {
    values.set('getFromCache', (...args: any[]) => {
      // v2 writers retain the exact cacheKey returned by this lookup.
      args[4] = `${cacheScope}:${args[4]}`;
      return getFromCache(...args);
    });
  }
  const validate = c.get('preRequestValidator');
  if (validate) {
    values.set('preRequestValidator', async (...args: any[]) => {
      const denial = await validate(...args);
      if (denial instanceof Response)
        denial.headers.set('x-portkey-gateway-exception', 'true');
      return denial;
    });
  }
  child.get = (key: string) => (values.has(key) ? values.get(key) : c.get(key));
  child.set = (key: string, value: any) => {
    if (values.has(key)) values.set(key, value);
    else c.set(key, value);
  };
  return child;
}

/** Read a provider stream without buffering it and cancel upstream when it is dropped. */
async function* responseBytes(
  response: Response,
  signal: AbortSignal
): AsyncGenerator<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const onAbort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return;
      yield value;
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function responseStream(
  body: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  cancel: () => void
): ReadableStream<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const { done, value } = await iterator.next();
        signal.throwIfAborted();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
        await iterator.return?.();
      }
    },
    async cancel() {
      cancel();
      await iterator.return?.();
    },
  });
}

/** Execute a full libsy algorithm while Portkey owns every provider call. */
export async function routeSwitchyard(
  c: Context,
  group: Targets,
  request: Params | FormData | ReadableStream,
  endpoint: endpointStrings,
  execute: (
    target: Targets,
    index: number,
    body: Params,
    endpoint: endpointStrings,
    context: Context
  ) => Promise<Response>
): Promise<Response> {
  const format: WireFormat | undefined =
    endpoint === 'chatComplete'
      ? 'openai_chat'
      : endpoint === 'createModelResponse'
        ? 'openai_responses'
        : endpoint === 'messages'
          ? 'anthropic_messages'
          : undefined;
  if (
    !format ||
    request instanceof FormData ||
    request instanceof ReadableStream
  ) {
    return routingError(
      'Switchyard supports Chat Completions, Responses, and Messages JSON requests'
    );
  }
  const organisation = getContext(c, ContextKeys.ORGANISATION_DETAILS);
  const requestHeaders = getContext(c, ContextKeys.MAPPED_HEADERS);
  if (
    !organisation?.id ||
    !organisation.workspaceDetails?.id ||
    !organisation.apiKeyDetails?.id ||
    !requestHeaders
  )
    return routingError(
      'Switchyard requires an authenticated Portkey context',
      401
    );
  const options = group.strategy?.switchyard;
  if (!options)
    throw new RouterError('Missing Switchyard algorithm configuration');
  const targets = (group.targets ?? []) as (Targets & { isOpen?: boolean })[];
  if (
    requestHeaders[PORTKEY_HEADER_KEYS.CACHE] === 'semantic' ||
    [group, ...targets].some((target) =>
      typeof target.cache === 'string'
        ? target.cache === 'semantic'
        : target.cache?.mode === 'semantic'
    )
  )
    return routingError(
      'Switchyard currently supports simple caching only; semantic caching is not supported'
    );
  const names = new Set<string>();
  for (const target of targets) {
    if (
      !target.name ||
      names.has(target.name) ||
      !target.provider ||
      target.isOpen ||
      target.strategy ||
      target.targets ||
      !target.overrideParams?.model
    ) {
      throw new RouterError(
        'Switchyard requires uniquely named, available provider targets with explicit models'
      );
    }
    names.add(target.name);
  }
  if (
    !targets.length ||
    Object.keys(options.formats ?? {}).some((name) => !names.has(name))
  )
    throw new RouterError(
      'Switchyard target formats must refer to available target names'
    );
  const targetOptions = Object.fromEntries(
    targets.map((target) => [
      target.name!,
      {
        model: target.overrideParams!.model!,
        format: options.formats?.[target.name!] ?? 'openai_chat',
      },
    ])
  );
  const outerSignal: AbortSignal = c.env?.switchyardSignal ?? c.req.raw.signal;
  const stopped = new AbortController();
  const signal = AbortSignal.any([outerSignal, stopped.signal]);
  c.set('switchyardSignal', signal);
  // Preserve the native outward response while Portkey logs individual provider calls.
  c.set('switchyardResponse', true);
  const replies = new Map<
    number,
    {
      target: string;
      status: number;
      headers: Record<string, string>;
      hookResults?: unknown;
    }
  >();
  let denied: Response | undefined;
  try {
    signal.throwIfAborted();
    const key = await routerKey(c, group, requestHeaders);
    const { AlgorithmRouter } = await import('@switchyard/libsy');
    let router = routers.get(key);
    if (!router) {
      try {
        router = AlgorithmRouter.create({
          algorithm: options.algorithm,
          targets: targetOptions,
        });
      } catch {
        throw new RouterError(
          'Invalid Switchyard algorithm or target configuration'
        );
      }
      routers.set(key, router);
      if (routers.size > routerLimit)
        routers.delete(routers.keys().next().value!);
    } else {
      routers.delete(key);
      routers.set(key, router);
    }
    const result = await router.execute(
      {
        format,
        body: { ...request, ...group.overrideParams },
        headers: Object.fromEntries(
          [...c.req.raw.headers].filter(
            ([name]) =>
              !name.startsWith('x-portkey-') &&
              ![
                'authorization',
                'x-api-key',
                'api-key',
                PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS,
              ].includes(name)
          )
        ),
      },
      {
        signal,
        call: async (call, { signal: callSignal }) => {
          callSignal.throwIfAborted();
          const index = targets.findIndex(
            (target) => target.name === call.target
          );
          if (index < 0)
            throw new RouterError('Switchyard selected an unavailable target');
          const target = targets[index];
          const body = call.body as Params;
          const child = callContext(
            c,
            call.format,
            body,
            callSignal,
            `${key}:${call.target}`,
            requestHeaders
          );
          let response: Response;
          try {
            response = await execute(
              {
                ...target,
                // The native request includes routing-time rewrites and overrides.
                overrideParams: { ...target.overrideParams, ...body },
              },
              index,
              body,
              calls[call.format].endpoint,
              child
            );
          } finally {
            const logs = (child.get('requestOptions') ?? []).map(
              (log: any) => ({
                ...log,
                // v2 logs hold the same response returned by tryPost; native code consumes it.
                response: log.response.clone(),
                switchyardEndpoint: calls[call.format].endpoint,
              })
            );
            c.set('requestOptions', [
              ...(c.get('requestOptions') ?? []),
              ...logs,
            ]);
          }
          callSignal.throwIfAborted();
          if (
            response.headers.get('x-portkey-gateway-exception') === 'true' ||
            [401, 402, 403, 446].includes(response.status)
          ) {
            denied ??= response;
            stopped.abort(new Error('Portkey denied the Switchyard call'));
            throw stopped.signal.reason;
          }
          const headers = Object.fromEntries(response.headers);
          // This stays inside the host bridge and identifies the answer even if a judge uses the same target.
          headers['x-portkey-switchyard-call-id'] = String(call.id);
          replies.set(call.id, {
            target: call.target,
            status: response.status,
            headers,
          });
          if (
            response.ok &&
            response.headers.get('content-type')?.includes('text/event-stream')
          ) {
            return {
              status: response.status,
              headers,
              body: responseBytes(response, callSignal),
            };
          }
          const text = await response.text();
          let responseBody: unknown;
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody = text;
          }
          if (
            responseBody &&
            typeof responseBody === 'object' &&
            'hook_results' in responseBody
          ) {
            replies.get(call.id)!.hookResults = responseBody.hook_results;
          }
          if (
            !response.ok &&
            responseBody &&
            typeof responseBody === 'object'
          ) {
            const failure = responseBody as {
              status?: string;
              error?: { type?: string; code?: string };
            };
            if (
              failure.status === 'failure' ||
              /budget|insufficient_quota/.test(
                `${failure.error?.type ?? ''} ${failure.error?.code ?? ''}`
              ) ||
              (response.status === 408 &&
                failure.error?.type === 'timeout_error')
            ) {
              denied ??= new Response(text, response);
              stopped.abort(new Error('Portkey denied the Switchyard call'));
              throw stopped.signal.reason;
            }
            if (
              response.status === 400 &&
              (failure.error?.code === 'context_length_exceeded' ||
                failure.error?.type === 'exceed_context_size_error')
            ) {
              return {
                status: response.status,
                headers,
                body: responseBody,
                error: { kind: 'context_window' as const, message: text },
              };
            }
          }
          return { status: response.status, headers, body: responseBody };
        },
      }
    );
    signal.throwIfAborted();
    const lastReply =
      replies.get(Number(result.headers['x-portkey-switchyard-call-id'])) ??
      [...replies.values()]
        .reverse()
        .find(
          (reply) =>
            reply.target === result.model && reply.status === result.status
        );
    const headers = new Headers(
      result.status >= 400 && lastReply && lastReply.status === result.status
        ? { ...lastReply.headers, ...result.headers }
        : result.headers
    );
    for (const name of [
      'content-length',
      'content-encoding',
      'transfer-encoding',
      'x-portkey-switchyard-call-id',
    ])
      headers.delete(name);
    const streaming =
      result.body &&
      typeof result.body === 'object' &&
      Symbol.asyncIterator in result.body;
    headers.set(
      'content-type',
      streaming ? 'text/event-stream' : 'application/json'
    );
    const body = streaming
      ? responseStream(result.body as AsyncIterable<Uint8Array>, signal, () =>
          stopped.abort()
        )
      : JSON.stringify(
          lastReply?.hookResults &&
            result.body &&
            typeof result.body === 'object'
            ? { ...result.body, hook_results: lastReply.hookResults }
            : result.body
        );
    return new Response(body, { status: result.status, headers });
  } catch (error) {
    if (denied) {
      // An outer Portkey fallback must not bypass gateway policy.
      denied.headers.set('x-portkey-gateway-exception', 'true');
      return denied;
    }
    if (outerSignal.aborted)
      return routingError('Switchyard request cancelled', 499);
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ERR_INVALID_REQUEST'
    )
      return routingError('Invalid Switchyard request or continuation');
    throw error;
  }
}
