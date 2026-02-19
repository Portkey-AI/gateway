import { logger } from '../../../apm';
import { PORTKEY_HEADER_KEYS } from '../../../middlewares/portkey/globals';
import {
  postRequestApikeyUsageValidator,
  postRequestIntegrationUsageLimitsValidator,
  postRequestVirtualKeyUsageLimitsValidator,
  postRequestWorkspaceUsageValidator,
} from '../../../middlewares/portkey/handlers/usage';
import { postRequestUsageLimitsPolicyValidator } from '../../../middlewares/portkey/handlers/usageLimitPolicies';
import {
  AnalyticsLogObject,
  VirtualKeyDetails,
} from '../../../middlewares/portkey/types';

/**
 * Single entry point for handling usage tracking
 */
export async function handlePostRequestUsage(
  env: Record<string, any>,
  store: Record<string, any>,
  chLogObject: AnalyticsLogObject,
  logUsage: boolean
) {
  if (!logUsage) return;
  // Skip if cache hit
  const isCacheHit = ['HIT', 'SEMANTIC HIT'].includes(
    chLogObject.cache_status.value as string
  );
  if (isCacheHit) return;

  const apiKey = store[PORTKEY_HEADER_KEYS.API_KEY];

  // Calculate values once
  const costAmount = chLogObject.cost.value || 0;
  const tokenAmount = chLogObject.total_units.value || 0;
  if (!costAmount && !tokenAmount) return;
  const organisationId = store.organisationDetails?.id;
  const metadata = store.metadata;
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

  if (!organisationId) return;

  const promises = [];
  try {
    // Budget Policy Usage Tracking
    promises.push(
      postRequestUsageLimitsPolicyValidator({
        env,
        organisationDetails: store.organisationDetails,
        metadata,
        costAmount,
        tokenAmount,
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
    if (integrationDetails) {
      promises.push(
        postRequestIntegrationUsageLimitsValidator({
          env,
          organisationId,
          workspaceId: store.organisationDetails.workspaceDetails.id,
          costAmount,
          tokenAmount,
          metadata,
          usageLimits: integrationDetails.usage_limits,
          integrationDetails,
        })
      );
    }
    // Handle Workspace Usage
    promises.push(
      postRequestApikeyUsageValidator({
        env,
        organisationDetails: store.organisationDetails,
        apiKey: apiKey,
        costAmount,
        tokenAmount,
        metadata,
      })
    );
    promises.push(
      postRequestWorkspaceUsageValidator({
        env,
        organisationId,
        workspaceDetails: store.organisationDetails.workspaceDetails,
        costAmount,
        tokenAmount,
        metadata,
      })
    );
    if (virtualKeyDetailsObj) {
      promises.push(
        postRequestVirtualKeyUsageLimitsValidator({
          env,
          organisationId,
          virtualKeyId: virtualKeyDetailsObj.id,
          usageLimits: virtualKeyDetailsObj.usage_limits,
          costAmount,
          tokenAmount,
          metadata,
          virtualKeyDetails: virtualKeyDetailsObj,
        })
      );
    }
    await Promise.all(promises);
  } catch (err: any) {
    logger.error({
      message: `handleUsage error: ${err.message}`,
    });
  }
}
