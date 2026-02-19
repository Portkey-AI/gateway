import { requestCache } from '../../../services/cache/cacheService';
import {
  EntityStatus,
  RateLimiterKeyTypes,
  RateLimiterTypes,
} from '../globals';
import {
  OrganisationDetails,
  RateLimitPolicy,
  RateLimitPolicyMatchResult,
  PolicyContext,
  VirtualKeyDetails,
} from '../types';
import { logger } from '../../../apm';
import { RATE_LIMIT_UNIT_TO_WINDOW_MAPPING } from '../../../globals';
import { checkConditionsMatch, generateValuesKey } from './policyUtils';

/**
 * Generate Redis rate limiter key for a rate limit policy value combination
 */
export function generateRateLimitPolicyKey({
  organisationId,
  policyId,
  valueKey,
}: {
  organisationId: string;
  policyId: string;
  valueKey: string;
}): string {
  return `rate-limit-policy-${organisationId}-${policyId}-${valueKey}`;
}

/**
 * Match policies against current request context
 * Uses conditions for matching and groupBy for bucketing
 */
export function matchRateLimitPolicies({
  policies,
  context,
}: {
  policies: RateLimitPolicy[];
  context: PolicyContext;
}): RateLimitPolicyMatchResult[] {
  const matches: RateLimitPolicyMatchResult[] = [];

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

    const rateLimiterKey = generateRateLimitPolicyKey({
      organisationId: context.organisationId,
      policyId: policy.id,
      valueKey,
    });

    matches.push({
      policy,
      valueKey,
      rateLimiterKey,
    });
  }

  return matches;
}

/**
 * Pre-request validation: Check if any matching policy rate limit is exceeded
 * For 'requests' unit: Consumes 1 token immediately
 * For 'tokens' unit: Only checks if tokens are available (actual consumption happens post-request)
 */
export function preRequestRateLimitPolicyValidator({
  env,
  organisationDetails,
  maxTokens,
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
  maxTokens: number;
  metadata: Record<string, string>;
  virtualKeyDetails: VirtualKeyDetails | null;
  providerSlug?: string;
  configId?: string;
  configSlug?: string;
  promptId?: string;
  promptSlug?: string;
  model?: string;
}) {
  const cache = requestCache(env);
  const promises: Promise<{
    keyType: RateLimiterKeyTypes;
    key: string;
    allowed: boolean;
    waitTime: number;
    availableTokens: number;
  }>[] = [];

  try {
    // Fetch policies
    const policies =
      organisationDetails.workspaceDetails.policies?.rate_limits || [];

    if (!policies || policies.length === 0) {
      return promises;
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
    const matches = matchRateLimitPolicies({
      policies,
      context,
    });

    // Check all matching policies
    for (const match of matches) {
      const { policy, rateLimiterKey } = match;

      // Skip if no valid rate limit value set
      if (!policy.value || policy.value <= 0) {
        continue;
      }

      const windowSize = RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[policy.unit];

      // For 'requests' unit: consume 1 token now
      // For 'tokens' unit: only check availability (consume in post-request)
      const shouldConsume = policy.type === RateLimiterTypes.REQUESTS;
      const tokensToCheck =
        policy.type === RateLimiterTypes.REQUESTS ? 1 : maxTokens;

      promises.push(
        cache
          .checkRateLimit(
            rateLimiterKey,
            policy.value,
            windowSize,
            tokensToCheck,
            shouldConsume
          )
          .then((result) => ({
            keyType: RateLimiterKeyTypes.RATE_LIMIT_POLICY,
            key: rateLimiterKey,
            allowed: result.allowed,
            waitTime: result.waitTime,
            availableTokens: result.availableTokens,
          }))
      );
    }

    return promises;
  } catch (error: any) {
    logger.error({
      message: `Error in preRequestRateLimitPolicyValidator: ${error.message}`,
      organisationId: organisationDetails.id,
      workspaceId: organisationDetails.workspaceDetails?.id,
    });
    // In case of error, don't block the request
    return promises;
  }
}

/**
 * Post-request: Consume tokens for token-based rate limit policies
 * This is called after the request completes when we know the actual token usage
 */
export async function postRequestRateLimitPolicyValidator({
  env,
  organisationDetails,
  metadata,
  tokenToDecr,
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
  tokenToDecr: number;
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
      organisationDetails.workspaceDetails.policies?.rate_limits || [];

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
    const matches = matchRateLimitPolicies({
      policies,
      context,
    });

    // Only process token-based policies
    const tokenBasedMatches = matches.filter(
      (match) => match.policy.type === RateLimiterTypes.TOKENS
    );

    if (tokenBasedMatches.length === 0 || !tokenToDecr) {
      return;
    }

    const cache = requestCache(env);

    // Consume tokens for all matching token-based policies
    const promises = [];
    for (const match of tokenBasedMatches) {
      const { policy, rateLimiterKey } = match;

      // Skip if no valid rate limit value set
      if (!policy.value || policy.value <= 0) {
        continue;
      }

      const windowSize = RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[policy.unit];

      // Consume the actual tokens used
      promises.push(
        cache.checkRateLimit(
          rateLimiterKey,
          policy.value,
          windowSize,
          tokenToDecr,
          true // consume tokens
        )
      );
    }

    return Promise.all(promises);
  } catch (error: any) {
    logger.error({
      message: `Error in postRequestRateLimitPolicyValidator: ${error.message}`,
      organisationId: organisationDetails.id,
      workspaceId: organisationDetails.workspaceDetails?.id,
    });
    return [];
  }
}
