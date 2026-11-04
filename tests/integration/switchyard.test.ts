import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

// The real v2 app runs authN, authZ, Portkey mapping, hooks, cache and provider HTTP.
// Only control-plane/model endpoints are localhost fixtures; auth middleware is unchanged.
let app: (typeof import('../../src/index'))['default'];
let routeSwitchyard: (typeof import('../../src/services/switchyardRouter'))['routeSwitchyard'];
let retryRequest: (typeof import('../../src/handlers/retryHandler'))['retryRequest'];
let controlPlane: Server;
const authCalls: { key: string; authorization?: string }[] = [];
const organisationId = randomUUID();
const workspaceId = randomUUID();

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

before(async () => {
  controlPlane = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/v2/api-keys/self/details?')) {
      const key = String(req.headers['x-portkey-api-key'] ?? '');
      authCalls.push({ key, authorization: req.headers.authorization });
      if (!key.startsWith('tenant-')) {
        res.writeHead(401);
        res.end('{"error":"Invalid API Key"}');
        return;
      }
      res.end(
        JSON.stringify({
          data: {
            organisation_details: {
              organisation_id: organisationId,
              owner_id: randomUUID(),
              is_first_generation_done: true,
              settings: {},
              defaults: {},
            },
            api_key_details: {
              id: `id-${key}`,
              key,
              status: 'active',
              scopes: key.includes('no-scope') ? [] : ['completions.write'],
              usage_limits: [],
              rate_limits: [],
              defaults: {},
            },
            workspace_details: {
              id: workspaceId,
              slug: 'ws-integration-test',
              status: 'active',
              usage_limits: [],
              rate_limits: [],
              defaults: {},
            },
          },
        })
      );
    } else if (req.url?.startsWith('/v2/integrations/')) {
      res.end('{"data":[]}');
    } else if (req.url?.startsWith('/pricing/')) {
      res.end('null');
    } else {
      res.writeHead(404);
      res.end(
        JSON.stringify({ error: `Unexpected control plane path ${req.url}` })
      );
    }
  });
  const base = await listen(controlPlane);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    CACHE_STORE: 'memory',
    ENABLE_PROMETHEUS: 'false',
    ALBUS_BASEPATH: base,
    DATASERVICE_BASEPATH: base,
    CONTROL_PLANE_BASEPATH: base,
    CONFIG_READER_PATH: base,
    PORTKEY_CLIENT_AUTH: 'local-control-plane-auth',
    FETCH_SETTINGS_FROM_FILE: 'false',
    ANALYTICS_STORE: 'none',
    LOG_STORE: 'none',
    PRIVATE_DEPLOYMENT: 'OFF',
    SWITCHYARD_ENABLED: 'false',
  });
  // Environment snapshots process.env on import, so configure localhost services first.
  const { initializeMemCache } = await import('../../src/data-stores/memCache');
  initializeMemCache();
  app = (await import('../../src/index')).default;
  ({ routeSwitchyard } = await import('../../src/services/switchyardRouter'));
  ({ retryRequest } = await import('../../src/handlers/retryHandler'));
});

after(async () => {
  if (controlPlane) await close(controlPlane);
});

const messages = [{ role: 'user' as const, content: 'Fix the parser' }];
const inputs = [
  [
    '/v1/chat/completions',
    { model: 'route', messages },
    (r: any) => r.choices[0].message.content,
  ],
  [
    '/v1/responses',
    { model: 'route', input: 'Fix the parser' },
    (r: any) => r.output[0].content[0].text,
  ],
  [
    '/v1/messages',
    { model: 'route', messages, max_tokens: 100 },
    (r: any) => r.content[0].text,
  ],
] as const;

function chat(model: string, content = 'answer') {
  return {
    id: 'answer',
    object: 'chat.completion',
    created: 1,
    model,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content },
      },
    ],
    usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
  };
}

type ChatReply = ReturnType<typeof chat>;

const stage = {
  type: 'stage_router',
  capable_target: 'strong',
  efficient_target: 'fast',
  picker: 'efficient_first',
  confidence_threshold: 0.5,
};
const direct = {
  type: 'llm_classifier',
  mode: 'direct',
  fail_open: false,
  models: {
    judge: ['judge'],
    any: ['fast', 'strong'],
    fast: ['fast'],
    strong: ['strong'],
  },
  default_target: 'fast',
};

async function fixture(
  t: { after: typeof after },
  respond?: (
    body: any,
    res: ServerResponse,
    path: string
  ) => void | Promise<void>
) {
  const calls: { path: string; auth?: string; body: any }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({ path: req.url!, auth: req.headers.authorization, body });
    server.emit('call', body);
    if (respond) return respond(body, res, req.url!);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(chat(body.model)));
  });
  const base = await listen(server);
  t.after(() => close(server));
  const identity = `tenant-${randomUUID()}`;
  const config: any = {
    strategy: {
      mode: 'switchyard',
      switchyard: { algorithm: { type: 'passthrough', target: 'fast' } },
    },
    targets: ['fast', 'strong', 'judge'].map((name) => ({
      name,
      provider: 'openai',
      api_key: `${name}-test`,
      custom_host: `${base}/v1`,
      override_params: { model: `physical-${name}` },
    })),
  };
  const send = (
    body: any = inputs[0][1],
    options: {
      path?: string;
      config?: any;
      signal?: AbortSignal;
      headers?: Record<string, string>;
      enabled?: boolean;
      identity?: string | null;
    } = {}
  ) =>
    app.fetch(
      new Request(`http://gateway${options.path ?? inputs[0][0]}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-portkey-config': JSON.stringify(options.config ?? config),
          ...(options.identity !== null && {
            'x-portkey-api-key': options.identity ?? identity,
          }),
          ...options.headers,
        },
        body: JSON.stringify(body),
        signal: options.signal,
      }),
      options.enabled === false
        ? undefined
        : { switchyardRoute: routeSwitchyard }
    );
  return { config, calls, send, server, identity };
}

test('full v2 app rejects missing/invalid credentials and missing scopes before provider calls', async (t) => {
  const { calls, send } = await fixture(t);
  for (const [identity, status] of [
    [null, 401],
    ['invalid-key', 401],
    [`tenant-no-scope-${randomUUID()}`, 403],
  ] as const) {
    const response = await send(undefined, { identity });
    assert.equal(response.status, status, await response.clone().text());
    await response.text();
  }
  assert.equal(calls.length, 0);
  assert.ok(
    authCalls.some(
      (call) =>
        call.key === 'invalid-key' &&
        call.authorization === 'local-control-plane-auth'
    )
  );
});

test('full v2 app authenticates an ordinary provider route without Switchyard', async (t) => {
  const { calls, config, send, identity } = await fixture(t);
  const response = await send(undefined, {
    config: config.targets[0],
    enabled: false,
  });
  assert.equal(response.status, 200, await response.clone().text());
  const body = (await response.json()) as ChatReply;
  assert.equal(body.choices[0].message.content, 'answer');
  assert.equal(calls[0].auth, 'Bearer fast-test');
  assert.ok(authCalls.some((call) => call.key === identity));
});

for (const [path, body, text] of inputs) {
  test(`full v2 app routes authenticated ${path} through provider transport`, async (t) => {
    const { calls, send } = await fixture(t);
    const response = await send(body, { path });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(text(await response.json()), 'answer');
    assert.deepEqual(
      calls.map((call) => [call.path, call.auth, call.body.model]),
      [['/v1/chat/completions', 'Bearer fast-test', 'physical-fast']]
    );
    assert.equal(calls[0].body.messages[0].content, 'Fix the parser');
  });
}

test('preserves images and tool history using native codecs', async (t) => {
  const { calls, send } = await fixture(t);
  const history = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Inspect this' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/image.png', detail: 'low' },
        },
      ],
    },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'read1',
          type: 'function',
          function: { name: 'read', arguments: '{"path":"parser.rs"}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'read1', content: 'fn parse() {}' },
  ];
  const response = await send({ model: 'route', messages: history });
  assert.equal(response.status, 200, await response.clone().text());
  await response.text();
  assert.deepEqual(calls[0].body.messages, history);
});

for (const algorithm of [
  { type: 'random', targets: ['fast', 'strong'], weights: [1, 0], seed: 7 },
  stage,
  { type: 'noop' },
]) {
  test(`runs native ${algorithm.type} from shared configuration`, async (t) => {
    const { calls, config, send } = await fixture(t);
    config.strategy.switchyard.algorithm = algorithm;
    const response = await send(undefined, { config });
    assert.equal(response.status, 200, await response.clone().text());
    const body = (await response.json()) as ChatReply;
    assert.equal(
      body.choices[0].message.content,
      algorithm.type === 'noop' ? 'OK' : 'answer'
    );
    assert.equal(calls.length, algorithm.type === 'noop' ? 0 : 1);
  });
}

for (const format of ['openai_decisions', 'system_one']) {
  test(`uses ${format} codec with separate provider authentication`, async (t) => {
    const { calls, config, send } = await fixture(t, (body, res, path) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const decision =
        format === 'system_one'
          ? { answers: { route: { type: 'choice', choice: 'strong' } } }
          : {
              model: body.model,
              answers: [
                {
                  name: 'route',
                  type: 'choice',
                  choice: 'strong',
                  probabilities: [
                    { value: 'fast', probability: 0.25 },
                    { value: 'strong', probability: 0.75 },
                  ],
                },
              ],
              usage: {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: 0,
                input_tokens_details: {
                  cached_tokens: 0,
                  cache_write_tokens: 0,
                },
                output_tokens_details: { reasoning_tokens: 0 },
              },
            };
      res.end(
        JSON.stringify(
          path.endsWith('/decisions') || path.endsWith('/systemone')
            ? decision
            : chat(body.model)
        )
      );
    });
    config.strategy.switchyard = {
      algorithm: direct,
      formats: { judge: format },
    };
    const response = await send(inputs[1][1], {
      path: inputs[1][0],
      config,
      headers: { authorization: 'Bearer caller-not-provider' },
    });
    assert.equal(response.status, 200, await response.clone().text());
    await response.text();
    assert.deepEqual(
      calls.map((call) => [call.path, call.auth, call.body.model]),
      [
        [
          format === 'system_one' ? '/v1/systemone' : '/v1/decisions',
          'Bearer judge-test',
          'physical-judge',
        ],
        ['/v1/chat/completions', 'Bearer strong-test', 'physical-strong'],
      ]
    );
  });
}

test('keeps a policy refusal terminal through outer fallback', async (t) => {
  const { calls, config, send } = await fixture(t, (_body, res) => {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"Access denied","type":"permission_error"}}');
  });
  const response = await send(undefined, {
    config: {
      strategy: { mode: 'fallback' },
      targets: [config, config.targets[1]],
    },
  });
  assert.equal(response.status, 403, await response.clone().text());
  assert.equal(response.headers.get('x-portkey-gateway-exception'), 'true');
  assert.match(await response.text(), /Access denied/);
  assert.equal(calls.length, 1);
});

for (const deny of [false, true]) {
  test(`real provider hooks preserve ${deny ? 'blocking' : 'advisory'} failures across formats`, async (t) => {
    const { calls, config, send } = await fixture(t);
    config.targets[0].before_request_hooks = [
      {
        id: 'required-word',
        type: 'guardrail',
        deny,
        checks: [
          {
            id: 'default.contains',
            parameters: { words: ['absent-word'], operator: 'any', not: false },
          },
        ],
      },
    ];
    const response = await send(inputs[1][1], { path: inputs[1][0], config });
    assert.equal(
      response.status,
      deny ? 446 : 246,
      await response.clone().text()
    );
    const body = (await response.json()) as {
      hook_results: { before_request_hooks: { verdict: boolean }[] };
      output: { content: { text: string }[] }[];
    };
    assert.equal(body.hook_results.before_request_hooks[0].verdict, false);
    assert.equal(calls.length, deny ? 0 : 1);
    if (deny)
      assert.equal(response.headers.get('x-portkey-gateway-exception'), 'true');
    else assert.equal(body.output[0].content[0].text, 'answer');
  });
}

for (const [path, body] of inputs) {
  test(`streams provider SSE through authenticated ${path}`, async (t) => {
    const { calls, send } = await fixture(t, (body, res) => {
      const chunk = (delta: any, finish_reason: string | null) =>
        JSON.stringify({
          id: 'stream1',
          object: 'chat.completion.chunk',
          model: body.model,
          choices: [{ index: 0, delta, finish_reason }],
        });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(
        `data: ${chunk({ role: 'assistant', content: 'streamed answer' }, null)}\n\ndata: ${chunk({}, 'stop')}\n\ndata: [DONE]\n\n`
      );
    });
    const response = await send({ ...body, stream: true }, { path });
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(
      response.headers.get('content-type') ?? '',
      /text\/event-stream/
    );
    const events = await response.text();
    assert.match(events, /streamed answer/);
    assert.match(
      events,
      path === inputs[0][0]
        ? /\[DONE\]/
        : path === inputs[1][0]
          ? /response.completed/
          : /message_stop/
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.stream, true);
  });
}

test(
  'cancels an outstanding provider call promptly',
  { timeout: 5000 },
  async (t) => {
    const { calls, send, server } = await fixture(t, (_body, res) => {
      res.once('close', () => server.emit('upstreamClosed'));
    });
    const controller = new AbortController();
    const started = once(server, 'call');
    const response = send(undefined, { signal: controller.signal });
    await started;
    const closed = once(server, 'upstreamClosed');
    controller.abort();
    assert.equal((await response).status, 499);
    await closed;
    assert.equal(calls.length, 1);
  }
);

test('requires opt-in while preserving ordinary authenticated routes', async (t) => {
  const { calls, config, send } = await fixture(t);
  const disabled = await send(undefined, { enabled: false });
  assert.equal(disabled.status, 400);
  assert.match(await disabled.text(), /opt.in Node backend/);
  assert.equal(calls.length, 0);
  const ordinary = await send(undefined, {
    enabled: false,
    config: config.targets[0],
  });
  assert.equal(ordinary.status, 200, await ordinary.clone().text());
  await ordinary.text();
  assert.equal(calls.length, 1);
});

test(
  'keeps a Portkey deadline terminal with its original status',
  { timeout: 3000 },
  async (t) => {
    const { config, calls, send } = await fixture(t, () => {});
    config.targets[0].request_timeout = 25;
    const response = await send(undefined, { config });
    assert.equal(response.status, 408, await response.clone().text());
    assert.match(await response.text(), /timeout|exceeded/i);
    assert.equal(calls.length, 1);
  }
);

for (const status of [503, 429]) {
  test(
    `cancels ${status} retry wait without a late attempt`,
    { timeout: 3000 },
    async (t) => {
      const { calls, server } = await fixture(t, (_body, res) => {
        res.writeHead(status, {
          'content-type': 'application/json',
          'retry-after': '2',
        });
        res.end('{"error":{"message":"retry later"}}');
      });
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const controller = new AbortController();
      const started = once(server, 'call');
      const pending = retryRequest(
        `http://127.0.0.1:${address.port}/v1/chat/completions`,
        {
          method: 'POST',
          body: '{"model":"physical-fast"}',
          signal: controller.signal,
        },
        2,
        [status],
        null,
        undefined,
        status === 429
      );
      await started;
      await sleep(30);
      controller.abort();
      await assert.rejects(
        pending,
        (error) => error === controller.signal.reason
      );
      await sleep(30);
      assert.equal(calls.length, 1);
    }
  );
}

for (const code of ['context_length_exceeded', 'invalid_argument']) {
  test(`only recognized context overflow advances candidate list (${code})`, async (t) => {
    const { config, calls, send } = await fixture(t, (body, res) => {
      res.writeHead(body.model === 'physical-fast' ? 400 : 200, {
        'content-type': 'application/json',
      });
      res.end(
        JSON.stringify(
          body.model === 'physical-fast'
            ? {
                error: {
                  code,
                  type: 'invalid_request_error',
                  message: 'Rejected',
                },
              }
            : chat(body.model)
        )
      );
    });
    config.strategy.switchyard.algorithm = stage;
    const response = await send(undefined, { config });
    assert.equal(
      response.status,
      code === 'context_length_exceeded' ? 200 : 400,
      await response.clone().text()
    );
    await response.text();
    assert.deepEqual(
      calls.map((call) => call.body.model),
      code === 'context_length_exceeded'
        ? ['physical-fast', 'physical-strong']
        : ['physical-fast']
    );
  });
}

test('reuses native cross-format continuation state across authenticated Responses requests', async (t) => {
  const { config, calls, send } = await fixture(t);
  config.strategy.switchyard.algorithm = {
    type: 'random',
    targets: ['fast', 'strong'],
    seed: 7,
  };
  const first = await send(inputs[1][1], { path: inputs[1][0], config });
  assert.equal(first.status, 200, await first.clone().text());
  const saved = (await first.json()) as { id: string };
  const next = await send(
    { model: 'route', previous_response_id: saved.id, input: 'Continue' },
    {
      path: inputs[1][0],
      config,
    }
  );
  assert.equal(next.status, 200, await next.clone().text());
  await next.text();
  assert.equal(calls[1].body.model, calls[0].body.model);
  assert.deepEqual(
    calls[1].body.messages.map((message: any) => [
      message.role,
      message.content,
    ]),
    [
      ['user', 'Fix the parser'],
      ['assistant', 'answer'],
      ['user', 'Continue'],
    ]
  );
});

test('separates credential identities while caching routed answers', async (t) => {
  const { config, calls, send, identity } = await fixture(t);
  config.cache = { mode: 'simple' };
  for (const tenant of [identity, identity, `tenant-${randomUUID()}`]) {
    const response = await send(undefined, { config, identity: tenant });
    assert.equal(response.status, 200, await response.clone().text());
    const body = (await response.json()) as ChatReply;
    assert.equal(body.choices[0].message.content, 'answer');
    await sleep(20);
  }
  assert.equal(calls.length, 2);
  assert.ok(authCalls.some((call) => call.key === identity));
});

test('keeps same-model answer caches separate for each logical target credential', async (t) => {
  let decisions = 0;
  let answers = 0;
  const { config, calls, send } = await fixture(t, (body, res, path) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        path.endsWith('/systemone')
          ? {
              answers: {
                route: {
                  type: 'choice',
                  choice: ++decisions === 1 ? 'fast' : 'strong',
                },
              },
            }
          : chat(body.model, `credential answer ${++answers}`)
      )
    );
  });
  config.strategy.switchyard = {
    algorithm: direct,
    formats: { judge: 'system_one' },
  };
  for (const target of config.targets.slice(0, 2)) {
    target.override_params.model = 'physical-shared';
    target.cache = { mode: 'simple' };
  }
  for (const expected of [
    'credential answer 1',
    'credential answer 2',
    'credential answer 2',
  ]) {
    const response = await send(undefined, { config });
    assert.equal(response.status, 200, await response.clone().text());
    const body = (await response.json()) as ChatReply;
    assert.equal(body.choices[0].message.content, expected);
    await sleep(20);
  }
  assert.deepEqual(
    calls.map((call) => call.auth),
    [
      'Bearer judge-test',
      'Bearer fast-test',
      'Bearer judge-test',
      'Bearer strong-test',
      'Bearer judge-test',
    ]
  );
  assert.equal(answers, 2);
});

test('rejects semantic cache configuration before any provider call', async (t) => {
  const { config, calls, send } = await fixture(t);
  for (const location of ['group', 'leaf', 'header']) {
    const current = structuredClone(config);
    if (location === 'group') current.cache = { mode: 'semantic' };
    if (location === 'leaf') current.targets[0].cache = { mode: 'semantic' };
    const response = await send(undefined, {
      config: current,
      headers: location === 'header' ? { 'x-portkey-cache': 'semantic' } : {},
    });
    assert.equal(response.status, 400, await response.clone().text());
    assert.match(await response.text(), /semantic caching is not supported/);
  }
  assert.equal(calls.length, 0);
});

test('handler-level cached calls recheck mutable per-target permissions', async () => {
  // This isolates tryPost's cache/validator order; the full-app tests above exercise authentication.
  const { Hono } = await import('hono');
  const { hooks } = await import('../../src/middlewares/hooks');
  const { tryPost } = await import('../../src/handlers/handlerUtils');
  const gateway = new Hono<{
    Variables: {
      switchyardCall: boolean;
      preRequestValidator: () => Promise<Response | undefined>;
      getFromCache: () => Promise<string[]>;
    };
  }>();
  let denied = false;
  let validations = 0;
  let cacheLookups = 0;
  gateway.use('*', hooks);
  gateway.post('/v1/chat/completions', async (c) => {
    c.set('switchyardCall', true);
    c.set('preRequestValidator', async () => {
      validations++;
      return denied
        ? new Response('{"error":{"type":"model_not_allowed_error"}}', {
            status: 412,
            headers: { 'content-type': 'application/json' },
          })
        : undefined;
    });
    c.set('getFromCache', async () => {
      cacheLookups++;
      return [
        JSON.stringify(chat('physical-fast', 'Cached')),
        'HIT',
        'cached-answer',
      ];
    });
    return tryPost(
      c,
      {
        provider: 'openai',
        apiKey: 'fast-test',
        customHost: 'http://127.0.0.1:9/v1',
        cache: { mode: 'simple' },
        overrideParams: { model: 'physical-fast' },
      },
      inputs[0][1],
      {},
      'chatComplete',
      0
    );
  });
  const allowed = await gateway.request('/v1/chat/completions', {
    method: 'POST',
  });
  assert.equal(allowed.status, 200, await allowed.clone().text());
  const body = (await allowed.json()) as ChatReply;
  assert.equal(body.choices[0].message.content, 'Cached');
  assert.equal(validations, 1);
  assert.equal(cacheLookups, 1);
  denied = true;
  const blocked = await gateway.request('/v1/chat/completions', {
    method: 'POST',
  });
  assert.equal(blocked.status, 412, await blocked.clone().text());
  assert.equal(validations, 2);
  assert.equal(cacheLookups, 1);
});
