import {
  AtomicCounterTypes,
  AtomicKeyTypes,
  CacheKeyTypes,
  EntityStatus,
} from '../globals';
import {
  UsageLimitsPolicy,
  UsageLimitsPolicyMatchResult,
  OrganisationDetails,
  PolicyContext,
  VirtualKeyDetails,
} from '../types';
import { logger } from '../../../apm';
import { generateV2CacheKey } from './cache';
import { requestCache } from '../../../services/cache/cacheService';
import { incrementInMemory } from '../../../utils/cacheKeyTracker';
import { resyncOrganisationData } from '../../../services/albus';
import { checkConditionsMatch, generateValuesKey } from './policyUtils';

/**
 * Generate cache key for usage limits policy exhausted values
 */
function generateExhaustedValuesCacheKey({
  organisationId,
  workspaceId,
  policyId,
}: {
  organisationId: string;
  workspaceId: string;
  policyId: string;
}): string {
  return generateV2CacheKey({
    organisationId,
    workspaceId,
    cacheKeyType: CacheKeyTypes.USAGE_LIMITS_POLICY_EXHAUSTED,
    key: policyId,
  });
}

/**
 * Get exhausted values for a policy from cache
 * Returns a Set for O(1) lookup performance
 * Uses in-memory cache to avoid repeated Redis calls
 * Now uses Redis Sets (SMEMBERS) via KV wrapper
 */
async function getExhaustedValuesFromCache({
  env,
  organisationId,
  workspaceId,
  policyId,
}: {
  env: Record<string, any>;
  organisationId: string;
  workspaceId: string;
  policyId: string;
}): Promise<Set<string>> {
  try {
    const cacheKey = generateExhaustedValuesCacheKey({
      organisationId,
      workspaceId,
      policyId,
    });

    // Use cache service to get set members (with memCache support)
    return await requestCache(env).getSetMembers(cacheKey, true, 30);
  } catch (error: any) {
    logger.error({
      message: `Error getting exhausted values from cache: ${error.message}`,
      policyId,
      organisationId,
      workspaceId,
    });
    return new Set();
  }
}

/**
 * Generate Redis counter key for a budget policy value combination
 */
export function generateBudgetPolicyCounterKey({
  organisationId,
  policyId,
  valueKey,
  counterType,
}: {
  organisationId: string;
  policyId: string;
  valueKey: string;
  counterType: AtomicCounterTypes;
}): string {
  return `atomic-counter-${organisationId}-${counterType}-${AtomicKeyTypes.USAGE_LIMITS_POLICY}-${policyId}-${valueKey}`;
}

/**
 * Match policies against current request context
 * Uses conditions for matching and groupBy for bucketing
 */
export async function matchBudgetPolicies({
  env,
  policies,
  context,
}: {
  env: Record<string, any>;
  policies: UsageLimitsPolicy[];
  context: PolicyContext;
}): Promise<UsageLimitsPolicyMatchResult[]> {
  const matches: UsageLimitsPolicyMatchResult[] = [];

  for (const policy of policies) {
    // Skip if policy itself is not active
    if (policy.status !== EntityStatus.ACTIVE) {
      continue;
    }

    // Step 1: Check if conditions match (for filtering)
    const conditionsMatch = checkConditionsMatch(policy.conditions, context);
    if (!conditionsMatch) {
      // Policy doesn't match this request
      continue;
    }

    // Step 2: Generate value key from groupBy (for bucketing)
    const valueKey = generateValuesKey(policy.group_by, context);
    if (valueKey === null) {
      // Can't generate a valid bucket key
      continue;
    }

    // Get exhausted values from cache (as Set for O(1) lookup)
    const exhaustedValuesSet = await getExhaustedValuesFromCache({
      env,
      organisationId: context.organisationId,
      workspaceId: context.workspaceId,
      policyId: policy.id,
    });
    const isExhausted = exhaustedValuesSet.has(valueKey);

    matches.push({
      policy,
      valueKey,
      isExhausted,
    });
  }

  return matches;
}

/**
 * Pre-request validation: Check if any matching policy is exhausted
 */
export async function preRequestUsageLimitsPolicyValidator({
  env,
  organisationDetails,
  metadata,
  virtualKeyDetails,
  providerSlug,
  configId,
  configSlug,
  promptId,
  promptSlug,
  model,
}: {
  env: Record<string, any>;
  organisationDetails: OrganisationDetails;
  metadata: Record<string, string>;
  virtualKeyDetails: VirtualKeyDetails | null;
  providerSlug?: string;
  configId?: string;
  configSlug?: string;
  promptId?: string;
  promptSlug?: string;
  model?: string;
}): Promise<{
  isExhausted: boolean;
  blockingPolicy?: UsageLimitsPolicyMatchResult;
}> {
  try {
    // Fetch policies
    const policies =
      organisationDetails.workspaceDetails.policies?.usage_limits || [];

    if (!policies || policies.length === 0) {
      return { isExhausted: false };
    }

    const context: PolicyContext = {
      apiKeyId: organisationDetails.apiKeyDetails.id,
      metadata,
      organisationId: organisationDetails.id,
      workspaceId: organisationDetails.workspaceDetails?.id,
      virtualKeyId: virtualKeyDetails?.id,
      virtualKeySlug: virtualKeyDetails?.slug,
      providerSlug,
      configId,
      configSlug,
      promptId,
      promptSlug,
      model,
    };
    // Match policies to current request
    const matches = await matchBudgetPolicies({
      env,
      policies,
      context,
    });

    // Check if any matching policy value is exhausted
    for (const match of matches) {
      if (match.isExhausted) {
        return {
          isExhausted: true,
          blockingPolicy: match,
        };
      }
    }

    return { isExhausted: false };
  } catch (error: any) {
    logger.error({
      message: `Error in preRequestBudgetPolicyValidator: ${error.message}`,
      organisationId: organisationDetails.id,
      workspaceId: organisationDetails.workspaceDetails?.id,
    });
    // In case of error, don't block the request
    return { isExhausted: false };
  }
}

/**
 * Post-request: Increment usage for all matching policies
 * For Cloudflare Workers: Uses threshold-aware increment to trigger resync when credit limit is crossed
 */
export async function postRequestUsageLimitsPolicyValidator({
  env,
  organisationDetails,
  metadata,
  costAmount,
  tokenAmount,
  virtualKeyDetails,
  providerSlug,
  configId,
  configSlug,
  promptId,
  promptSlug,
  model,
}: {
  env: Record<string, any>;
  organisationDetails: OrganisationDetails;
  metadata: Record<string, string>;
  costAmount: number;
  tokenAmount: number;
  virtualKeyDetails: VirtualKeyDetails | null;
  providerSlug?: string;
  configId?: string;
  configSlug?: string;
  promptId?: string;
  promptSlug?: string;
  model?: string;
}) {
  try {
    // Fetch policies
    const policies =
      organisationDetails.workspaceDetails.policies?.usage_limits || [];
    if (!policies || policies.length === 0) {
      return;
    }

    const context: PolicyContext = {
      apiKeyId: organisationDetails.apiKeyDetails.id,
      metadata,
      organisationId: organisationDetails.id,
      workspaceId: organisationDetails.workspaceDetails?.id,
      virtualKeyId: virtualKeyDetails?.id,
      virtualKeySlug: virtualKeyDetails?.slug,
      providerSlug,
      configId,
      configSlug,
      promptId,
      promptSlug,
      model,
    };

    // Match policies to current request
    const matches = await matchBudgetPolicies({
      policies,
      context,
      env,
    });

    // Increment usage for all matching policies
    const incrementPromises: Promise<unknown>[] = [];
    for (const match of matches) {
      const { policy, valueKey, isExhausted } = match;

      // Skip if already exhausted
      if (isExhausted) {
        continue;
      }

      const isCostType =
        policy.type === AtomicCounterTypes.COST || !policy.type;
      const counterType = isCostType
        ? AtomicCounterTypes.COST
        : AtomicCounterTypes.TOKENS;

      const amount = isCostType ? costAmount : tokenAmount || 0;

      if (!amount) {
        continue;
      }

      // Generate the counter key
      const counterKey = generateBudgetPolicyCounterKey({
        organisationId: organisationDetails.id,
        policyId: policy.id,
        valueKey,
        counterType,
      });

      // Convert credit_limit from dollars to cents for cost type (thresholds stored in dollars, tracking in cents)
      const creditLimitInUnits =
        isCostType && policy.credit_limit != null
          ? policy.credit_limit * 100
          : policy.credit_limit;

      // Increment with threshold checking (Cloudflare handles thresholds inline, Node.js in resyncDataWorker)
      const incrementResult = await incrementInMemory(
        organisationDetails.id,
        counterKey,
        amount,
        env,
        {
          creditLimit: creditLimitInUnits,
          alertThreshold: null, // Policies don't have alert thresholds currently
          isThresholdAlertsSent: null,
        }
      );

      // For Cloudflare: Handle threshold result and trigger resync when credit limit is crossed
      if (incrementResult?.thresholdCrossed && incrementResult?.exhausted) {
        // Credit limit crossed - add valueKey to exhausted set and trigger resync
        const exhaustedCacheKey = generateExhaustedValuesCacheKey({
          organisationId: organisationDetails.id,
          workspaceId: organisationDetails.workspaceDetails.id,
          policyId: policy.id,
        });

        // Add to exhausted set in cache
        await requestCache(env).addToSet(exhaustedCacheKey, valueKey);

        // Trigger resync to control plane to mark as exhausted
        try {
          incrementPromises.push(
            resyncOrganisationData({
              env,
              organisationId: organisationDetails.id,
              usageLimitsPoliciesToExhaust: [
                {
                  id: policy.id,
                  value_key: valueKey,
                },
              ],
              usageLimitsPoliciesToUpdateUsage: [
                {
                  id: policy.id,
                  value_key: valueKey,
                  usage: incrementResult.value,
                },
              ],
            })
          );
          logger.info({
            message: `Policy exhaustion resync completed`,
            organisationId: organisationDetails.id,
            policyId: policy.id,
            valueKey,
            creditLimit: policy.credit_limit,
            currentUsage: incrementResult.value,
          });
        } catch (error: any) {
          logger.error({
            message: `Policy exhaustion resync error: ${error.message}`,
            organisationId: organisationDetails.id,
            policyId: policy.id,
            valueKey,
          });
        }
      }
    }

    // Wait for all increments to complete (only relevant for Cloudflare)
    if (incrementPromises.length > 0) {
      await Promise.all(incrementPromises);
    }
  } catch (error: any) {
    logger.error({
      message: `Error in postRequestUsageLimitsPolicyValidator: ${error.message}`,
      organisationId: organisationDetails.id,
      workspaceId: organisationDetails.workspaceDetails?.id,
    });
  }
}
