import { Cluster, Redis } from 'ioredis';
import {
  AtomicCounterRequestType,
  AtomicCounterResponseType,
} from '../middlewares/portkey/types';
import {
  AtomicCounterTypes,
  AtomicKeyTypes,
  AtomicOperations,
} from '../middlewares/portkey/globals';

export class AtomicCounter {
  private redisClient: Redis | Cluster;
  private counterType?: AtomicCounterTypes;

  constructor(redisClient: Redis | Cluster, counterType?: AtomicCounterTypes) {
    this.redisClient = redisClient;
    this.counterType = counterType || AtomicCounterTypes.COST;
  }

  async fetch(request: Partial<AtomicCounterRequestType>) {
    const {
      type,
      organisationId,
      key,
      operation,
      amount,
      usageLimitId,
      policyId,
      valueKey,
    } = request;
    let statusCode = 200;
    const finalKey = generateAtomicCounterKey({
      type,
      organisationId,
      key,
      counterType: this.counterType,
      usageLimitId,
      policyId,
      valueKey,
    });
    const resp: AtomicCounterResponseType = {
      success: true,
      type,
      key,
      value: 0,
    };
    switch (operation) {
      case AtomicOperations.GET:
        resp.value = await this.get(finalKey);
        break;
      case AtomicOperations.INCREMENT:
        resp.value = await this.increment(finalKey, amount || 0);
        break;
      case AtomicOperations.DECREMENT:
        resp.value = await this.decrement(finalKey, amount || 0);
        break;
      case AtomicOperations.RESET:
        await this.reset(finalKey);
        break;
      default:
        resp.success = false;
        resp.message = 'Invalid Operation';
        statusCode = 400;
        break;
    }
    return new Response(JSON.stringify(resp), {
      headers: {
        'content-type': 'application/json',
      },
      status: statusCode,
    });
  }

  async reset(key: string) {
    await this.redisClient.del(key);
  }

  async get(key: string) {
    const value = await this.redisClient.get(key);
    return value ? Number(value) : 0;
  }

  async set(key: string, value: number) {
    this.redisClient.set(key, value);
  }

  async increment(key: string, amount: number) {
    const value = await this.redisClient.incrbyfloat(key, amount);
    return parseFloat(value);
  }

  async decrement(key: string, amount: number) {
    const value = await this.redisClient.incrbyfloat(key, amount * -1);
    return parseFloat(value);
  }
}

export function generateAtomicCounterKey({
  type,
  organisationId,
  key,
  counterType,
  usageLimitId,
  policyId,
  valueKey,
}: Partial<AtomicCounterRequestType>) {
  const resolvedCounterType = counterType || AtomicCounterTypes.COST;
  // Special handling for USAGE_LIMITS_POLICY type
  if (type === AtomicKeyTypes.USAGE_LIMITS_POLICY && policyId && valueKey) {
    return `atomic-counter-${organisationId}-${resolvedCounterType}-${type}-${policyId}-${valueKey}`;
  }
  return `atomic-counter-${organisationId}-${resolvedCounterType}-${type}-${key}${usageLimitId ? `-usageLimitId-${usageLimitId}` : ''}`;
}

export function generateKeysFromAtomicCounterKey(counterKey: string):
  | {
      organisationId: string;
      counterType: AtomicCounterTypes;
      type: AtomicKeyTypes;
      key: string;
      usageLimitId?: string;
      policyId?: string;
      valueKey?: string;
    }
  | undefined {
  // UUID pattern
  const uuidPattern =
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

  // Extract usageLimitId if it exists
  const usageLimitMatch = counterKey.match(
    new RegExp(`-usageLimitId-(${uuidPattern})$`)
  );
  const usageLimitId = usageLimitMatch ? usageLimitMatch[1] : undefined;

  // Remove the usageLimitId portion if it exists
  const keyWithoutUsageLimit = usageLimitMatch
    ? counterKey.slice(0, usageLimitMatch.index)
    : counterKey;

  // Remove 'atomic-counter-' prefix
  const withoutPrefix = keyWithoutUsageLimit.replace('atomic-counter-', '');

  // Extract organisationId (first UUID in the string)
  const orgMatch = withoutPrefix.match(new RegExp(`^(${uuidPattern})`));
  if (!orgMatch) {
    return;
  }
  const organisationId = orgMatch[1];

  // Remove organisationId from the string
  const afterOrgId = withoutPrefix.slice(organisationId.length + 1); // +1 for the hyphen

  // Get counterType (first part after orgId)
  const [counterType, type, ...keyParts] = afterOrgId.split('-');

  if (!counterType || !type || keyParts.length === 0) {
    return;
  }

  // Rejoin the remaining parts as the key (since key might contain hyphens)
  const key = keyParts.join('-');

  // Special handling for USAGE_LIMITS_POLICY type
  if (type === AtomicKeyTypes.USAGE_LIMITS_POLICY) {
    // For usage limits policies: atomic-counter-{orgId}-{counterType}-USAGE_LIMITS_POLICY-{policyId}-{valueKey}
    // Key format: {policyId}-{valueKey}
    // policyId is a UUID, valueKey can contain colons and other characters
    const policyKeyMatch = key.match(new RegExp(`^(${uuidPattern})-(.+)$`));
    if (policyKeyMatch) {
      return {
        organisationId,
        counterType: counterType as AtomicCounterTypes,
        type: type as AtomicKeyTypes,
        key,
        policyId: policyKeyMatch[1],
        valueKey: policyKeyMatch[2],
      };
    }
  }

  return {
    organisationId,
    counterType: counterType as AtomicCounterTypes,
    type: type as AtomicKeyTypes,
    key,
    usageLimitId,
  };
}
