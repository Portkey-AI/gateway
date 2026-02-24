import { logger } from '../../../apm';
import {
  PORTKEY_HEADER_KEYS,
  RateLimiterKeyTypes,
} from '../../../middlewares/portkey/globals';
import { postRequestRateLimitPolicyValidator } from '../../../middlewares/portkey/handlers/rateLimitPolicies';
import { postRequestRateLimitValidator } from '../../../middlewares/portkey/handlers/rateLimits';
import {
  AnalyticsLogObject,
  VirtualKeyDetails,
} from '../../../middlewares/portkey/types';

export async function handlePostRequestRateLimits(
  env: Record<string, any>,
  store: Record<string, any>,
  chLogObject: AnalyticsLogObject,
  logUsage: boolean
) {
  try {
    const isCacheHit = ['HIT', 'SEMANTIC HIT'].includes(
      chLogObject.cache_status.value as string
    );
    if (isCacheHit || !logUsage) {
      return;
    }
    const tokenToDecr = chLogObject.total_units.value || 0;
    if (!tokenToDecr) return;
    const metadata = store.metadata;
    const isJwt = store.organisationDetails?.apiKeyDetails?.isJwt;
    const apiKeyRateLimitKey = isJwt
      ? store.organisationDetails?.apiKeyDetails?.key
      : store.organisationDetails?.apiKeyDetails?.id;
    const workspaceId = store.organisationDetails.workspaceDetails.id;

    const apiKeyRateLimits =
      store.organisationDetails?.apiKeyDetails?.rateLimits;
    const workspaceRateLimits =
      store.organisationDetails?.workspaceDetails?.rate_limits;
    const virtualKeyDetails =
      store.incomingBody.providerOptions.virtualKeyDetails ||
      store.incomingBody.config.portkeyHeaders[
        PORTKEY_HEADER_KEYS.VIRTUAL_KEY_DETAILS
      ];

    let virtualKeyDetailsObj: VirtualKeyDetails | null = null;
    if (virtualKeyDetails) {
      virtualKeyDetailsObj =
        typeof virtualKeyDetails === 'string'
          ? JSON.parse(virtualKeyDetails)
          : virtualKeyDetails;
    }
    const virtualKeyRateLimits = virtualKeyDetailsObj?.rate_limits || [];
    const virtualKeyId = virtualKeyDetailsObj?.id;

    let integrationDetails =
      store.incomingBody.providerOptions.integrationDetails ||
      store.incomingBody.config.portkeyHeaders[
        PORTKEY_HEADER_KEYS.INTEGRATION_DETAILS
      ];
    if (integrationDetails) {
      integrationDetails =
        typeof integrationDetails === 'string'
          ? JSON.parse(integrationDetails)
          : integrationDetails;
    }
    const integrationRateLimits = integrationDetails?.rate_limits || [];

    const promises = [];
    promises.push(
      postRequestRateLimitValidator({
        env,
        rateLimits: apiKeyRateLimits,
        key: apiKeyRateLimitKey,
        keyType: RateLimiterKeyTypes.API_KEY,
        tokenToDecr,
        organisationId: store.organisationDetails.id,
      })
    );
    promises.push(
      postRequestRateLimitValidator({
        env,
        rateLimits: workspaceRateLimits,
        key: workspaceId,
        keyType: RateLimiterKeyTypes.WORKSPACE,
        tokenToDecr,
        organisationId: store.organisationDetails.id,
      })
    );
    if (virtualKeyId && virtualKeyRateLimits?.length) {
      promises.push(
        postRequestRateLimitValidator({
          env,
          rateLimits: virtualKeyRateLimits,
          key: virtualKeyId,
          keyType: RateLimiterKeyTypes.VIRTUAL_KEY,
          tokenToDecr,
          organisationId: store.organisationDetails.id,
        })
      );
    }
    if (integrationDetails) {
      promises.push(
        postRequestRateLimitValidator({
          env,
          rateLimits: integrationRateLimits,
          key: `${integrationDetails.id}-${store.organisationDetails.workspaceDetails.id}`,
          keyType: RateLimiterKeyTypes.INTEGRATION_WORKSPACE,
          tokenToDecr,
          organisationId: store.organisationDetails.id,
        })
      );
    }
    promises.push(
      postRequestRateLimitPolicyValidator({
        env,
        organisationDetails: store.organisationDetails,
        metadata,
        tokenToDecr,
        virtualKeyDetails: virtualKeyDetailsObj,
        providerSlug: store.proxyProvider,
        configId:
          store.incomingBody.config.portkeyHeaders?.[
            PORTKEY_HEADER_KEYS.CONFIG_ID
          ],
        configSlug:
          store.incomingBody.config.portkeyHeaders?.[
            PORTKEY_HEADER_KEYS.CONFIG_SLUG
          ],
        promptId:
          store.incomingBody.config.portkeyHeaders?.[
            PORTKEY_HEADER_KEYS.PROMPT_ID
          ],
        promptSlug:
          store.incomingBody.config.portkeyHeaders?.[
            PORTKEY_HEADER_KEYS.PROMPT_SLUG
          ],
        model: chLogObject.ai_model?.value || undefined,
      })
    );
    await Promise.all(promises);
  } catch (err: any) {
    logger.error({
      message: `handlePostRequestRateLimits error: ${err.message}`,
    });
  }
}
