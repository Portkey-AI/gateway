import { Context, Next } from 'hono';
import { env } from 'hono/adapter';
import {
  AtomicKeyTypes,
  EntityStatus,
  PORTKEY_HEADER_KEYS,
  RateLimiterKeyTypes,
} from '../portkey/globals';
import { generateApiErrorResponse } from '../../utils/error';
import { OrganisationDetails } from '../portkey/types';
import { fetchApiKeyDetails } from '../../services/albus';
import { preRequestUsageValidator } from '../portkey/handlers/usage';
import { preRequestRateLimitValidator } from '../portkey/handlers/rateLimits';
import { hash } from '../portkey/utils';
import { METRICS_KEYS } from '../../globals';
import { isValidJwt } from '../../utils/misc';
import { setContext, ContextKeys } from '../portkey/contextHelpers';
import { Environment } from '../../utils/env';

export const shouldSkipExhaustedCheck = (req: Context['req']) => {
  const { path, method, url } = req;
  return (
    (path.startsWith('/v1/batches') && method === 'GET') || // batch GET calls
    (path.startsWith('/v1/files') && method === 'GET') || // file GET calls
    (path.startsWith('/v1/fine_tuning') && method === 'GET') || // fine tuning GET calls
    url.includes('/v1/logs/') // logs get calls
  );
};

export const authNMiddleWare = () => {
  return async (c: Context, next: Next) => {
    c.set(METRICS_KEYS.AUTH_N_MIDDLEWARE_START, Date.now());
    const requestOrigin = c.req.raw.headers.get('Origin');
    const cfEnv = env(c);

    const portkeyApiKeyHeader = c.req.raw.headers.get(
      PORTKEY_HEADER_KEYS.API_KEY
    );

    const authorizationHeader = c.req.raw.headers
      .get(PORTKEY_HEADER_KEYS.AUTHORIZATION)
      ?.replace('Bearer ', '');

    let apiKey = portkeyApiKeyHeader;

    // If x-portkey-api-key is not present but authorization is present, use that as pk api key
    if (!apiKey && authorizationHeader) {
      apiKey = authorizationHeader;
    }

    if (!apiKey && authorizationHeader) {
      apiKey = authorizationHeader;
    }

    let apiKeyDetails;
    if (apiKey) {
      apiKeyDetails = await fetchApiKeyDetails(cfEnv, apiKey);
    }
    if (apiKeyDetails == null) {
      const message = 'Invalid API Key';
      return generateApiErrorResponse(message, '03', 401, requestOrigin);
    }
    if (!apiKey || !apiKeyDetails?.organisation_details?.organisation_id) {
      const message = 'Unable to validate key';
      return generateApiErrorResponse(message, '033', 401, requestOrigin);
    }
    const orgDetails = apiKeyDetails.organisation_details;
    const usageLimits = Array.isArray(
      apiKeyDetails.api_key_details?.usage_limits
    )
      ? apiKeyDetails.api_key_details?.usage_limits
      : apiKeyDetails.api_key_details?.usage_limits
        ? [apiKeyDetails.api_key_details?.usage_limits]
        : [];
    const organisationDetails: OrganisationDetails = {
      id: orgDetails.organisation_id,
      ownerId: orgDetails.owner_id || null,
      name: orgDetails.name || null,
      settings: orgDetails.settings || {},
      isFirstGenerationDone: orgDetails.is_first_generation_done || null,
      enterpriseSettings: orgDetails.enterprise_settings || null,
      workspaceDetails: apiKeyDetails.workspace_details,
      scopes: apiKeyDetails.api_key_details?.scopes || [],
      defaults: apiKeyDetails.api_key_details?.defaults || {},
      usageLimits: usageLimits,
      rateLimits: apiKeyDetails.api_key_details?.rate_limits || [],
      status: apiKeyDetails.api_key_details?.status || EntityStatus.ACTIVE,
      apiKeyDetails: {
        id: apiKeyDetails.api_key_details.id,
        // for Jwt tokens use the temp key generated
        key: apiKeyDetails.api_key_details.key || apiKey,
        isJwt: isValidJwt(apiKey),
        scopes: apiKeyDetails.api_key_details?.scopes || [],
        defaults: apiKeyDetails.api_key_details?.defaults || {},
        expiresAt: apiKeyDetails.api_key_details.expires_at,
        usageLimits: usageLimits,
        rateLimits: apiKeyDetails.api_key_details?.rate_limits || [],
        status: apiKeyDetails.api_key_details?.status || EntityStatus.ACTIVE,
        systemDefaults: apiKeyDetails.api_key_details.system_defaults,
        userId: apiKeyDetails.api_key_details.user_id || undefined,
      },
      organisationDefaults: orgDetails.defaults,
    };
    const isActionDenied =
      Environment(cfEnv).MANAGED_DEPLOYMENT === 'ON' &&
      organisationDetails.enterpriseSettings?.is_gateway_external;

    if (isActionDenied) {
      return generateApiErrorResponse('Forbidden!', '033', 403, requestOrigin);
    }

    // ignore exhausted check for logs get
    const skipExhaustedCheck = shouldSkipExhaustedCheck(c.req);
    if (!skipExhaustedCheck) {
      const { isExhausted: isApiKeyExhausted, isExpired: isApiKeyExpired } =
        await preRequestUsageValidator({
          env: cfEnv,
          entity: organisationDetails.apiKeyDetails,
          usageLimits: organisationDetails.apiKeyDetails?.usageLimits || [],
          entityType: AtomicKeyTypes.API_KEY,
          entityKey: organisationDetails.apiKeyDetails.key,
          organisationId: organisationDetails.id,
        });
      const {
        isExhausted: isWorkspaceExhausted,
        isExpired: isWorkspaceExpired,
      } = await preRequestUsageValidator({
        env: cfEnv,
        entity: organisationDetails.workspaceDetails,
        usageLimits: organisationDetails.workspaceDetails?.usage_limits || [],
        entityType: AtomicKeyTypes.WORKSPACE,
        entityKey: organisationDetails.workspaceDetails.id,
        organisationId: organisationDetails.id,
      });
      // Determine error code based on conditions
      let errorCode = '';
      if (isApiKeyExhausted || isWorkspaceExhausted) {
        errorCode = '04';
      } else if (isApiKeyExpired || isWorkspaceExpired) {
        errorCode = '01';
      }

      // Determine error message based on conditions
      let errorMessage = '';
      if (isApiKeyExhausted) {
        errorMessage = 'Portkey API Key Usage Limit Exceeded';
      } else if (isApiKeyExpired) {
        errorMessage = 'Portkey API Key Expired';
      } else if (isWorkspaceExhausted) {
        errorMessage = 'Portkey Workspace Usage Limit Exceeded';
      } else if (isWorkspaceExpired) {
        errorMessage = 'Portkey Workspace Expired';
      }

      const errorStatus = isApiKeyExhausted || isWorkspaceExhausted ? 412 : 401;
      if (errorCode) {
        return generateApiErrorResponse(
          errorMessage,
          errorCode,
          errorStatus,
          requestOrigin
        );
      }

      const rateLimitChecks = [];
      if (organisationDetails.workspaceDetails?.rate_limits) {
        rateLimitChecks.push(
          ...preRequestRateLimitValidator({
            env: cfEnv,
            rateLimits: organisationDetails.workspaceDetails.rate_limits,
            key: organisationDetails.workspaceDetails.id,
            keyType: RateLimiterKeyTypes.WORKSPACE,
            maxTokens: 1,
            organisationId: organisationDetails.id,
          })
        );
      }
      if (organisationDetails.apiKeyDetails?.rateLimits) {
        const apiKeyRateLimitKey = organisationDetails.apiKeyDetails?.isJwt
          ? organisationDetails.apiKeyDetails?.key
          : organisationDetails.apiKeyDetails?.id;
        rateLimitChecks.push(
          ...preRequestRateLimitValidator({
            env: cfEnv,
            rateLimits: organisationDetails.apiKeyDetails?.rateLimits || [],
            key: apiKeyRateLimitKey,
            keyType: RateLimiterKeyTypes.API_KEY,
            maxTokens: 1,
            organisationId: organisationDetails.id,
          })
        );
      }

      const results = await Promise.all(rateLimitChecks);
      const rateLimitStatus = results.find(
        (result) => result.allowed === false
      );
      if (rateLimitStatus) {
        const errorMessage =
          rateLimitStatus.keyType === RateLimiterKeyTypes.WORKSPACE
            ? `workspace ${hash(rateLimitStatus.key)} rate limit exceeded`
            : `apikey ${hash(rateLimitStatus.key)} rate limit exceded`;
        return generateApiErrorResponse(errorMessage, '05', 429, requestOrigin);
      }
    }

    // Store organisationDetails in context (primary storage)
    setContext(c, ContextKeys.ORGANISATION_DETAILS, organisationDetails);

    const headersObj = Object.fromEntries(c.req.raw.headers);
    // Keep header for backward compatibility during migration
    headersObj[PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS] =
      JSON.stringify(organisationDetails);

    // If authorization was used for portkey api key, set it in x-portkey-api-key header
    // This will be used by downstream workers
    if (!portkeyApiKeyHeader && authorizationHeader) {
      headersObj[PORTKEY_HEADER_KEYS.API_KEY] = authorizationHeader;
      // Remove authorization header after adding the x-portkey-api-key header as it becomes redundant
      delete headersObj[PORTKEY_HEADER_KEYS.AUTHORIZATION];
    }

    // If portkey API key is sent in both the headers (authorization and x-portkey-api-key), remove the authorization header.
    // This is specifically required for cases where proxy requests are made from SDKs because SDK sends the portkey API key in both the headers.
    // For proxy requests, this causes provider level errors when the provider itself also accepts Authorization header (which gets populated through virtual key).
    if (
      portkeyApiKeyHeader &&
      authorizationHeader &&
      portkeyApiKeyHeader === authorizationHeader
    ) {
      delete headersObj[PORTKEY_HEADER_KEYS.AUTHORIZATION];
    }

    c.set('headersObj', headersObj);
    c.set(METRICS_KEYS.AUTH_N_MIDDLEWARE_END, Date.now());
    return next();
  };
};
