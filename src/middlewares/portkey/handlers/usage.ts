import { AtomicCounterTypes, AtomicOperations, EntityStatus } from '../globals';
import {
  AtomicCounterRequestType,
  IntegrationDetails,
  OrganisationDetails,
  UsageLimits,
  VirtualKeyDetails,
  WorkspaceDetails,
} from '../types';

function generateAtomicKey({
  organisationId,
  type,
  key,
}: Partial<AtomicCounterRequestType>) {
  return `${organisationId}-${type}-${key}`;
}

async function atomicCounterHandler({
  env,
  organisationId,
  type,
  key,
  amount,
  operation,
  counterType,
  metadata,
  usageLimitId,
}: { env: Record<string, any> } & Partial<AtomicCounterRequestType>) {
  counterType = counterType || AtomicCounterTypes.COST;
  const atomicCounterStub = env.ATOMIC_COUNTER.get(
    env.ATOMIC_COUNTER.idFromName(
      generateAtomicKey({ organisationId, type, key })
    )
  );
  const body: Partial<AtomicCounterRequestType> = {
    organisationId,
    type,
    key,
    operation,
    amount,
    counterType,
    metadata,
    usageLimitId,
  };
  const apiRes = await atomicCounterStub.fetch(
    'https://api.portkey.ai/v1/health',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
  const data = await apiRes.json();
  return data;
}

export async function getCurrentUsage({
  env,
  organisationId,
  type,
  key,
  counterType,
  usageLimitId,
}: { env: Record<string, any> } & Partial<AtomicCounterRequestType>) {
  return atomicCounterHandler({
    env,
    organisationId,
    type,
    key,
    counterType,
    operation: AtomicOperations.GET,
    usageLimitId,
  });
}

export async function incrementUsage({
  env,
  organisationId,
  type,
  key,
  amount,
  counterType,
  usageLimitId,
}: { env: Record<string, any> } & Partial<AtomicCounterRequestType>) {
  return atomicCounterHandler({
    env,
    organisationId,
    type,
    key,
    amount,
    counterType,
    operation: AtomicOperations.INCREMENT,
    usageLimitId,
  });
}

export async function resetUsage({
  env,
  organisationId,
  type,
  key,
  counterType,
  usageLimitId,
}: { env: Record<string, any> } & AtomicCounterRequestType) {
  return atomicCounterHandler({
    env,
    organisationId,
    type,
    key,
    counterType,
    operation: AtomicOperations.RESET,
    usageLimitId,
  });
}

export function preRequestUsageValidator({
  env,
  entity,
  usageLimits,
  metadata,
}: {
  env: Record<string, any>;
  entity:
    | OrganisationDetails['apiKeyDetails']
    | WorkspaceDetails
    | VirtualKeyDetails
    | IntegrationDetails;
  usageLimits: UsageLimits[];
  metadata?: Record<string, string>;
}) {
  let isExhausted = entity?.status === EntityStatus.EXHAUSTED;
  for (const usageLimit of usageLimits) {
    if (isExhausted) {
      break;
    }
    isExhausted = usageLimit.status === EntityStatus.EXHAUSTED;
  }
  const isExpired = entity?.status === EntityStatus.EXPIRED;
  return {
    isExhausted,
    isExpired,
  };
}
