import type { ConfiguredAlgorithm, RoutingOutcome } from '@switchyard/libsy';
import type { Context } from 'hono';
import { RouterError } from '../errors/RouterError';
import { HEADER_KEYS } from '../globals';
import { ContextKeys, getContext } from '../middlewares/portkey/contextHelpers';
import { PORTKEY_HEADER_KEYS } from '../middlewares/portkey/globals';
import type { endpointStrings } from '../providers/types';
import type { Params, Targets } from '../types/requestBody';

type WireFormat = 'openai_chat' | 'openai_responses' | 'anthropic_messages';
const routers = new Map<string, ConfiguredAlgorithm>();
const routerLimit = 64;
const calls: Record<WireFormat, { endpoint: endpointStrings; path: string }> = {
  openai_chat: { endpoint: 'chatComplete', path: '/v1/chat/completions' },
  openai_responses: {
    endpoint: 'createModelResponse',
    path: '/v1/responses',
  },
  anthropic_messages: { endpoint: 'messages', path: '/v1/messages' },
};

function toml(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(toml).join(', ')}]`;
  if (value && typeof value === 'object')
    return `{ ${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)} = ${toml(item)}`)
      .join(', ')} }`;
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  throw new RouterError('Switchyard configuration must contain TOML values');
}

function routingError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ status: 'failure', message }), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-portkey-gateway-exception': 'true',
    },
  });
}

// Algorithm state and caches stay private to each credential and provider configuration.
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
  format: WireFormat,
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

/** Drive Switchyard routing with Portkey-owned provider calls. */
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
  const body = { ...request, ...group.overrideParams };
  if (body.stream)
    return routingError('Switchyard HTTP streaming is not supported yet', 501);
  if (
    format === 'openai_responses' &&
    (body.previous_response_id || body.conversation)
  )
    return routingError(
      'Switchyard Responses continuation is not supported yet'
    );
  if (
    Object.values(options.formats ?? {}).some(
      (value) => !Object.hasOwn(calls, value)
    )
  )
    return routingError('Unsupported Switchyard target format');

  const {
    AlgorithmFactory,
    ContextWindowExceededError,
    LlmResponse,
    Step,
    TranslationEngine,
  } = await import('@switchyard/libsy');
  const engine = new TranslationEngine();
  let requestIR: Record<string, any>;
  try {
    requestIR = engine.decodeRequest(format, body).request;
  } catch {
    return routingError('Invalid Switchyard request');
  }
  const outerSignal: AbortSignal = c.env?.switchyardSignal ?? c.req.raw.signal;
  const stopped = new AbortController();
  const signal = AbortSignal.any([outerSignal, stopped.signal]);
  c.set('switchyardSignal', signal);
  c.set('switchyardResponse', true);
  type ProviderReply = {
    response: Response;
    body: any;
    text: string;
    format: WireFormat;
  };
  const replies = new Map<number, ProviderReply>();
  const pending: Promise<void>[] = [];
  const provenance = 'x-portkey-switchyard-call-id';
  let run: ReturnType<ConfiguredAlgorithm['runStream']> | undefined;
  let denied: Response | undefined;
  let callFailure: { error: unknown; reply?: ProviderReply } | undefined;
  const closeRun = () => {
    void run?.return?.().catch(() => {});
  };
  signal.addEventListener('abort', closeRun, { once: true });

  const isContextOverflow = (reply: ProviderReply) =>
    reply.response.status === 400 &&
    (reply.body?.error?.code === 'context_length_exceeded' ||
      reply.body?.error?.type === 'exceed_context_size_error');

  async function callTarget(
    name: string,
    request: Record<string, any>,
    callSignal: AbortSignal
  ): Promise<ProviderReply> {
    callSignal.throwIfAborted();
    const index = targets.findIndex((target) => target.name === name);
    if (index < 0)
      throw new RouterError('Switchyard selected an unavailable target');
    const target = targets[index];
    const wireFormat = options!.formats?.[name] ?? 'openai_chat';
    // Encoding must use the prepared IR rather than replay the original wire body.
    const prepared = {
      ...request,
      model: target.overrideParams!.model,
      stream: false,
      preservation: { ...request.preservation, requests: {} },
    };
    const body = engine.encodeRequest(wireFormat, prepared).body as Params;
    const child = callContext(
      c,
      wireFormat,
      body,
      callSignal,
      key + ':' + name,
      requestHeaders!
    );
    let response: Response;
    try {
      response = await execute(
        { ...target, overrideParams: { ...target.overrideParams, ...body } },
        index,
        body,
        calls[wireFormat].endpoint,
        child
      );
    } finally {
      const logs = (child.get('requestOptions') ?? []).map((log: any) => ({
        ...log,
        response: log.response.clone(),
        switchyardEndpoint: calls[wireFormat].endpoint,
      }));
      c.set('requestOptions', [...(c.get('requestOptions') ?? []), ...logs]);
    }
    callSignal.throwIfAborted();
    const text = await response.text();
    let bodyJSON: any;
    try {
      bodyJSON = JSON.parse(text);
    } catch {
      bodyJSON = null;
    }
    const failure = bodyJSON?.error;
    if (
      response.headers.get('x-portkey-gateway-exception') === 'true' ||
      [401, 402, 403, 446].includes(response.status) ||
      (!response.ok &&
        (bodyJSON?.status === 'failure' ||
          /budget|insufficient_quota/.test(
            (failure?.type ?? '') + ' ' + (failure?.code ?? '')
          ) ||
          (response.status === 408 && failure?.type === 'timeout_error')))
    ) {
      denied ??= new Response(text, response);
      stopped.abort(new Error('Portkey denied the Switchyard call'));
      throw stopped.signal.reason;
    }
    return { response, text, body: bodyJSON, format: wireFormat };
  }

  function outward(
    response: Record<string, any>,
    reply?: ProviderReply
  ): Response {
    const fields = { ...response.extensions?.fields };
    delete fields[provenance];
    const clean = {
      ...response,
      extensions: { ...response.extensions, fields },
      preservation: { ...response.preservation, responses: {} },
    };
    const body = engine.encodeResponse(
      format!,
      clean,
      requestIR.extensions
    ).body;
    if (reply?.body?.hook_results) body.hook_results = reply.body.hook_results;
    const headers = new Headers(reply?.response.headers);
    for (const name of [
      'content-length',
      'content-encoding',
      'transfer-encoding',
    ])
      headers.delete(name);
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify(body), {
      status: reply?.response.status ?? 200,
      headers,
    });
  }

  let key = '';
  try {
    signal.throwIfAborted();
    key = await routerKey(c, group, requestHeaders);
    let router = routers.get(key);
    if (!router) {
      try {
        const config = {
          schema_version: 1,
          llm_clients: {
            portkey: { format: 'openai_chat', base_url: 'http://localhost/v1' },
          },
          targets: Object.fromEntries(
            targets.map((target) => [
              target.name!,
              { id: target.name, llm_client: 'portkey' },
            ])
          ),
          routes: {
            gateway: { ...(options.algorithm as object), id: 'portkey-route' },
          },
        };
        const source = Object.entries(config)
          .map(([name, value]) => name + ' = ' + toml(value))
          .join('\n');
        router = AlgorithmFactory.fromToml(source).build()['portkey-route'];
      } catch {
        return routingError(
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
    const headers = Object.fromEntries(
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
    );
    run = router.runStream(requestIR, { headers });
    if (signal.aborted) {
      await run.return?.();
      signal.throwIfAborted();
    }
    let outcome: RoutingOutcome | undefined;
    for await (const step of run) {
      signal.throwIfAborted();
      if (step instanceof Step.CallDecision)
        return routingError(
          'Switchyard decision-call transport is not supported yet',
          501
        );
      if (step instanceof Step.CallModel) {
        const controller = new AbortController();
        const callSignal = AbortSignal.any([signal, controller.signal]);
        let rejectedReply: ProviderReply | undefined;
        const work = (async () => {
          const reply = await callTarget(
            step.call.models[0],
            step.call.request,
            callSignal
          );
          if (!reply.response.ok) {
            rejectedReply = reply;
            if (isContextOverflow(reply))
              throw new ContextWindowExceededError(
                'Routing candidate exceeds the context window'
              );
            throw new Error(
              'Portkey provider returned HTTP ' + reply.response.status
            );
          }
          const response: Record<string, any> = engine.decodeResponse(
            reply.format,
            reply.body
          ).response;
          const id = replies.size + 1;
          replies.set(id, reply);
          response.extensions = {
            ...response.extensions,
            fields: { ...response.extensions?.fields, [provenance]: id },
          };
          return new LlmResponse.Agg(response);
        })();
        const responding = step.call.respond(work).finally(() => {
          controller.abort();
          void work.catch(() => {});
        });
        pending.push(
          responding.catch((error) => {
            if (callFailure === undefined) {
              callFailure = { error, reply: rejectedReply };
              stopped.abort(error);
            }
          })
        );
      } else if (step instanceof Step.Done) outcome = step.outcome;
    }
    signal.throwIfAborted();
    if (!outcome)
      throw new RouterError('Switchyard returned no routing outcome');
    if (outcome.response instanceof LlmResponse.Agg) {
      const response = outcome.response.response as Record<string, any>;
      return outward(
        response,
        replies.get(response.extensions?.fields?.[provenance])
      );
    }
    if (outcome.response)
      return routingError(
        'Switchyard normalized response streaming is not supported yet',
        501
      );
    for (const [index, name] of outcome.selected_model_ids.entries()) {
      const request =
        outcome.candidate_requests[name] ??
        (index > 0 ? outcome.fallback_request : null) ??
        outcome.request;
      const reply = await callTarget(name, request, signal);
      if (
        isContextOverflow(reply) &&
        index + 1 < outcome.selected_model_ids.length
      )
        continue;
      if (!reply.response.ok) return new Response(reply.text, reply.response);
      return outward(
        engine.decodeResponse(reply.format, reply.body).response,
        reply
      );
    }
    throw new RouterError('Switchyard selected no available target');
  } catch (error) {
    stopped.abort(error);
    await Promise.allSettled(pending);
    if (denied) {
      denied.headers.set('x-portkey-gateway-exception', 'true');
      return denied;
    }
    if (outerSignal.aborted)
      return routingError('Switchyard request cancelled', 499);
    if (callFailure?.reply)
      return new Response(callFailure.reply.text, callFailure.reply.response);
    if (callFailure) throw callFailure.error;
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ERR_INVALID_REQUEST'
    )
      return routingError('Invalid Switchyard request');
    throw error;
  } finally {
    signal.removeEventListener('abort', closeRun);
    await run?.return?.();
    stopped.abort();
    await Promise.allSettled(pending);
  }
}
