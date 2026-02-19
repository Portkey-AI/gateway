import { Context } from 'hono';
import { generateCircuitBreakerConfigId } from '../utils/circuitBreaker';
import { generateRateLimitKey } from '../middlewares/portkey/handlers/rateLimits';
import {
  AtomicCounterTypes,
  AtomicKeyTypes,
  AtomicOperations,
  RateLimiterKeyTypes,
  RateLimiterTypes,
} from '../middlewares/portkey/globals';
import { logger } from '../apm';
import { generateAtomicCounterKey } from '../utils/atomicCounter';

interface DurableObjectRequest {
  type?: AtomicKeyTypes;
  // Common fields
  organisationId: string;
  // Circuit Breaker specific
  workspaceId?: string;
  configSlug?: string;
  operation?: AtomicOperations;
  // Rate Limiter specific
  rateLimiterType?: RateLimiterTypes;
  keyType?: RateLimiterKeyTypes;
  key?: string;
  unit?: 'rpm' | 'rph' | 'rpd';
  // Atomic Counter specific
  counterType?: AtomicCounterTypes;
  amount?: number;
  usageLimitId?: string;
  policyId?: string;
  valueKey?: string;
}

/**
 * Unified handler for Durable Object operations
 *
 * Endpoints:
 *   POST /v1/durable/circuit-breaker - Get/reset circuit breaker state
 *   POST /v1/durable/rate-limiter - Get rate limiter state
 *   POST /v1/durable/atomic-counter - Get/set atomic counter value
 *   POST /v1/durable - Legacy endpoint (routes to atomic-counter)
 */
export async function durableObjectsHandler(c: Context): Promise<Response> {
  const env = c.env as Record<string, any>;
  const url = new URL(c.req.url);
  const path = url.pathname;

  try {
    const body = await c.req.json<DurableObjectRequest>();

    // Route based on path
    if (path.includes('/v1/durable/circuit-breaker')) {
      return handleCircuitBreaker(env, body);
    }

    if (path.includes('/v1/durable/rate-limiter')) {
      return handleRateLimiter(env, body);
    }

    if (path.includes('/v1/durable/atomic-counter') || path === '/v1/durable') {
      return handleAtomicCounter(env, body);
    }

    return c.json({ error: 'Unknown durable object type' }, 400);
  } catch (error: any) {
    logger.error({
      message: `durableObjectsHandler error: ${error.message}`,
      path,
    });
    return c.json({ error: error.message }, 500);
  }
}

async function handleCircuitBreaker(
  env: Record<string, any>,
  body: DurableObjectRequest
): Promise<Response> {
  const {
    organisationId,
    workspaceId,
    configSlug,
    operation = 'status',
  } = body;

  if (!organisationId || !workspaceId || !configSlug) {
    return Response.json(
      {
        error:
          'Missing required fields: organisationId, workspaceId, configSlug',
      },
      { status: 400 }
    );
  }

  if (!env.CIRCUIT_BREAKER) {
    return Response.json(
      { error: 'CIRCUIT_BREAKER binding not available' },
      { status: 503 }
    );
  }

  const configId = generateCircuitBreakerConfigId(
    configSlug,
    workspaceId,
    organisationId
  );

  const stub = env.CIRCUIT_BREAKER.get(
    env.CIRCUIT_BREAKER.idFromName(configId)
  );

  // Map operations to new endpoint names
  const endpointMap: Record<string, string> = {
    status: 'getStatus',
    destroy: 'destroy',
    update: 'update',
  };

  const endpoint = endpointMap[operation as string] || 'getStatus';

  const response = await stub.fetch(`https://do/${endpoint}`, {
    method: 'POST',
  });

  return response;
}

async function handleRateLimiter(
  env: Record<string, any>,
  body: DurableObjectRequest
): Promise<Response> {
  const {
    organisationId,
    rateLimiterType = RateLimiterTypes.REQUESTS,
    keyType = RateLimiterKeyTypes.API_KEY,
    key,
    unit = 'rpm',
  } = body;

  if (!organisationId || !key) {
    return Response.json(
      { error: 'Missing required fields: organisationId, key' },
      { status: 400 }
    );
  }

  if (!env.RATE_LIMITER) {
    return Response.json(
      { error: 'RATE_LIMITER binding not available' },
      { status: 503 }
    );
  }

  const rateLimitKey = generateRateLimitKey(
    organisationId,
    rateLimiterType,
    keyType,
    key,
    unit
  );

  const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(rateLimitKey));

  // Fetch current state using /status endpoint
  const response = await stub.fetch('https://do/status', {
    method: 'GET',
  });

  const data = await response.json();

  return Response.json({
    keyType,
    key,
    rateLimitKey,
    ...data,
  });
}

async function handleAtomicCounter(
  env: Record<string, any>,
  body: DurableObjectRequest
): Promise<Response> {
  const {
    organisationId,
    counterType,
    type,
    key,
    operation = 'get',
    amount = 0,
    usageLimitId,
    policyId,
    valueKey,
  } = body;

  if (!organisationId || !type || !key) {
    return Response.json(
      {
        error: 'Missing required fields: organisationId, counterType/type, key',
      },
      { status: 400 }
    );
  }

  if (!env.ATOMIC_COUNTER) {
    return Response.json(
      { error: 'ATOMIC_COUNTER binding not available' },
      { status: 503 }
    );
  }

  const counterKey = generateAtomicCounterKey({
    organisationId,
    type,
    counterType: counterType || AtomicCounterTypes.COST,
    key,
    usageLimitId,
    policyId,
    valueKey,
  });

  const stub = env.ATOMIC_COUNTER.get(
    env.ATOMIC_COUNTER.idFromName(counterKey)
  );

  let endpoint: string;
  let method: string;
  let requestBody: string | undefined;

  switch (operation.toUpperCase()) {
    case 'GET':
      endpoint = '/get';
      method = 'GET';
      break;
    case 'INCREMENT':
      endpoint = '/increment';
      method = 'POST';
      requestBody = JSON.stringify({ amount });
      break;
    case 'DECREMENT':
      endpoint = '/increment';
      method = 'POST';
      requestBody = JSON.stringify({ amount: -amount });
      break;
    case 'SET':
      endpoint = '/set';
      method = 'POST';
      requestBody = JSON.stringify({ value: amount });
      break;
    case 'RESET':
      endpoint = '/reset';
      method = 'DELETE';
      break;
    default:
      return Response.json(
        { error: `Unknown operation: ${operation}` },
        { status: 400 }
      );
  }

  const response = await stub.fetch(`https://do${endpoint}`, {
    method,
    headers: requestBody ? { 'Content-Type': 'application/json' } : undefined,
    body: requestBody,
  });

  const data = await response.json();

  return Response.json({
    organisationId,
    counterType: type,
    key,
    counterKey,
    operation,
    ...data,
  });
}
