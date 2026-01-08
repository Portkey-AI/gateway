import Mustache from '@portkey-ai/mustache';

import { getMode } from '..';
import {
  AZURE_AI,
  AZURE_OPEN_AI,
  BEDROCK,
  EntityStatus,
  GUARDRAIL_CATEGORY_FLAG_MAP,
  HEADER_KEYS,
  HookTypePreset,
  hookTypePresets,
  MODES,
  OPEN_AI,
  providerAuthHeaderMap,
  providerAuthHeaderPrefixMap,
  RATE_LIMIT_UNIT_TO_WINDOW_MAPPING,
  RateLimiterKeyTypes,
  SAGEMAKER,
  VERTEX_AI,
  WORKERS_AI,
} from '../globals';
import {
  fetchOrganisationConfig,
  fetchOrganisationGuardrail,
  fetchOrganisationIntegrations,
  fetchOrganisationPrompt,
  fetchOrganisationPromptPartial,
  fetchOrganisationProviderFromSlug,
} from './albus';
import {
  BaseGuardrail,
  OrganisationDetails,
  RateLimit,
  VirtualKeyDetails,
  WorkspaceDetails,
} from '../types';
import { constructAzureFoundryURL } from '../utils';
import {
  checkCircuitBreakerStatus,
  CircuitBreakerContext,
  extractCircuitBreakerConfigs,
  generateCircuitBreakerConfigId,
  getCircuitBreakerMappedConfig,
} from '../circuitBreaker';

const mapCustomHeaders = (
  customHeaders: Record<string, any>,
  headers: Headers
) => {
  const headerKeys: string[] = [];
  Object.entries(customHeaders).forEach(([key, value]) => {
    if (key && typeof key === 'string' && typeof value === 'string') {
      const _key = key.toLowerCase();
      headerKeys.push(_key);
      headers.set(_key, value);
    }
  });
  return headerKeys;
};

const getVirtualKeyFromModel = (model: string | undefined) => {
  if (!model) {
    return null;
  }
  if (
    model.startsWith('@') &&
    // Cloudflare workers ai exception
    !model.startsWith('@cf/') &&
    !model.startsWith('@hf/')
  ) {
    return {
      virtualKey: model.slice(1).split('/')[0],
      model: model.slice(1).split('/').slice(1).join('/'),
    };
  }
  return null;
};

export const getUniqueVirtualKeysFromConfig = (config: Record<string, any>) => {
  let uniqueVirtualKeys: Set<string> = new Set();

  function recursiveCollectKeysFromTarget(
    currentConfig: Record<string, any>,
    configTargetType: string
  ) {
    if (!currentConfig[configTargetType]) {
      const virtualKeyDetailsFromModel = getVirtualKeyFromModel(
        currentConfig.override_params?.model
      );
      let virtualKeyFromModel: string | undefined;
      let mappedModelName: string | undefined;
      if (virtualKeyDetailsFromModel) {
        virtualKeyFromModel = virtualKeyDetailsFromModel.virtualKey;
        mappedModelName = virtualKeyDetailsFromModel.model;
      }
      if (currentConfig.provider?.startsWith('@')) {
        const virtualKey = currentConfig.provider.slice(1);
        uniqueVirtualKeys.add(virtualKey);
        currentConfig.virtual_key = virtualKey;
      } else if (currentConfig.virtual_key) {
        uniqueVirtualKeys.add(currentConfig.virtual_key);
      } else if (virtualKeyFromModel && mappedModelName) {
        const virtualKey = virtualKeyFromModel;
        uniqueVirtualKeys.add(virtualKey);
        currentConfig.virtual_key = virtualKey;
        currentConfig.override_params.model = mappedModelName;
      }
    }
    if (currentConfig[configTargetType]) {
      for (const target of currentConfig[configTargetType]) {
        recursiveCollectKeysFromTarget(target, configTargetType);
      }
    }
  }

  const configTargetType = config.options?.length ? 'options' : 'targets';

  recursiveCollectKeysFromTarget(config, configTargetType);

  return [...uniqueVirtualKeys];
};

export const getUniqueGuardrailsFromConfig = (config: Record<string, any>) => {
  let uniqueGuardrails: Set<string> = new Set();
  let rawHooksPresent = false;

  function recursiveCollectGuardrailsFromTarget(
    currentConfig: Record<string, any>
  ) {
    ['before_request_hooks', 'after_request_hooks'].forEach((hookType) => {
      if (currentConfig[hookType]) {
        rawHooksPresent = true;
        currentConfig[hookType].forEach((h: any) => {
          if (!h.checks) uniqueGuardrails.add(h.id);
        });
      }
    });

    ['output_guardrails', 'input_guardrails'].forEach((guardrailType) => {
      if (currentConfig[guardrailType]) {
        rawHooksPresent = true;
        currentConfig[guardrailType].forEach((h: any) => {
          if (typeof h === 'string') uniqueGuardrails.add(h);
          if (typeof h === 'object' && h.id?.startsWith('pg-')) {
            uniqueGuardrails.add(h.id);
          }
        });
      }
    });

    if (currentConfig.targets) {
      for (const target of currentConfig.targets) {
        recursiveCollectGuardrailsFromTarget(target);
      }
    }
  }

  recursiveCollectGuardrailsFromTarget(config);
  return { uniqueGuardrails: [...uniqueGuardrails], rawHooksPresent };
};

export const getVirtualKeyMap = async (
  env: any,
  virtualKeyArr: Array<string>,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails
) => {
  const promises = virtualKeyArr.map(async (virtualKey) => {
    const apiKeyKVRecord = await fetchOrganisationProviderFromSlug(
      env,
      orgApiKey,
      organisationId,
      workspaceDetails,
      virtualKey
    );
    return {
      virtualKey,
      apiKeyKVRecord,
    };
  });

  const results = await Promise.all(promises);

  const virtualKeyMap: Record<string, any> = {};
  const missingKeys: Array<string> = [];
  results.forEach(({ virtualKey, apiKeyKVRecord }) => {
    if (apiKeyKVRecord) {
      virtualKeyMap[virtualKey] = { ...apiKeyKVRecord };
    } else {
      missingKeys.push(virtualKey);
    }
  });

  return {
    virtualKeyMap,
    missingKeys,
  };
};

export const getGuardrailMap = async (
  env: any,
  guardrailSlugArr: BaseGuardrail[]
): Promise<{
  guardrailMap: Record<string, any>;
  missingGuardrails: string[];
}> => {
  const fetchPromises = guardrailSlugArr.map(async (guardrail) => {
    const guardrailKVRecord = await fetchOrganisationGuardrail(
      env,
      guardrail.organisationId,
      guardrail.workspaceId || null,
      guardrail.slug,
      false
    );
    return { guardrailSlug: guardrail.slug, guardrailKVRecord };
  });

  const results = await Promise.all(fetchPromises);

  const guardrailMap: Record<string, any> = {};
  const missingGuardrails: Array<string> = [];

  results.forEach(({ guardrailSlug, guardrailKVRecord }) => {
    if (guardrailKVRecord) {
      guardrailMap[guardrailSlug] = { ...guardrailKVRecord };
    } else {
      missingGuardrails.push(guardrailSlug);
    }
  });

  return {
    guardrailMap,
    missingGuardrails,
  };
};

/**
 * Retrieves a map of prompts from KV store or albus in an async manner.
 *
 * @param {string} env - CF environment.
 * @param {string[]} promptSlugArr - An array of prompt slugs.
 * @param {string} orgApiKey - The organisation's API key.
 * @param {string} organisationId - The organisation's ID.
 * @returns {Promise<{ promptMap: Object, missingPrompts: string[] }>} A Promise resolving to an object containing the prompt map and an array of missing prompt_ids which are not found.
 */
export const getPromptMap = async (
  env: any,
  promptSlugArr: Array<string>,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails
): Promise<{ promptMap: Record<string, any>; missingPrompts: string[] }> => {
  const fetchPromises = promptSlugArr.map(async (promptSlug) => {
    const promptKVRecord = await fetchOrganisationPrompt(
      env,
      organisationId,
      workspaceDetails,
      orgApiKey,
      promptSlug,
      false
    );
    return { promptSlug, promptKVRecord };
  });

  const results = await Promise.all(fetchPromises);

  const promptMap: Record<string, any> = {};
  const missingPrompts: Array<string> = [];

  results.forEach(({ promptSlug, promptKVRecord }) => {
    if (promptKVRecord) {
      promptMap[promptSlug] = { ...promptKVRecord };
    } else {
      missingPrompts.push(promptSlug);
    }
  });

  return {
    promptMap,
    missingPrompts,
  };
};

/**
 * Retrieves a map of prompts from KV store or albus in an async manner.
 *
 * @param {string} env - CF environment.
 * @param {string[]} promptPartialSlugArr - An array of prompt slugs.
 * @param {string} orgApiKey - The organisation's API key.
 * @param {string} organisationId - The organisation's ID.
 * @returns {Promise<{ promptPartialMap: Record<string, any>, missingPromptPartials: string[] }>} A Promise resolving to an object containing the prompt map and an array of missing prompt_ids which are not found.
 */
export const getPromptPartialMap = async (
  env: any,
  promptPartialSlugArr: Array<string>,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails
): Promise<{
  promptPartialMap: Record<string, any>;
  missingPromptPartials: string[];
}> => {
  const fetchPromises = promptPartialSlugArr.map(
    async (promptPartialSlugArr) => {
      const promptKVRecord = await fetchOrganisationPromptPartial(
        env,
        organisationId,
        workspaceDetails,
        orgApiKey,
        promptPartialSlugArr,
        false
      );
      return { promptPartialSlugArr, promptKVRecord };
    }
  );

  const results = await Promise.all(fetchPromises);

  const promptPartialMap: Record<string, any> = {};
  const missingPromptPartials: Array<string> = [];

  results.forEach(({ promptPartialSlugArr, promptKVRecord }) => {
    if (promptKVRecord) {
      promptPartialMap[promptPartialSlugArr] = { ...promptKVRecord };
    } else {
      missingPromptPartials.push(promptPartialSlugArr);
    }
  });

  return {
    promptPartialMap,
    missingPromptPartials,
  };
};

/**
 * Returns a config object with prompts mapped based on the provided prompt map and request body.
 *
 * @param {Object} promptMap - A map of prompts where key is prompt_id and value is a prompt data object.
 * @param {Object} config - The original config object.
 * @param {Object} requestBody - The request body.
 * @returns {Object} A new config object with prompts mapped based on prompt_id.
 */
export const getPromptMappedConfig = (
  promptMap: Record<string, any>,
  promptPartialMap: Record<string, any>,
  config: Record<string, any>,
  requestBody: Record<string, any>,
  promptIDFromURL: string
) => {
  const mappedConfig = { ...config };

  function recursiveAddPromptsToTarget(currentConfig: Record<string, any>) {
    if (
      !currentConfig.targets &&
      currentConfig.prompt_id &&
      promptMap[currentConfig.prompt_id]
    ) {
      const {
        provider_key_slug,
        id: promptUUID,
        prompt_version_id,
      } = promptMap[currentConfig.prompt_id];
      currentConfig.virtual_key =
        currentConfig.virtual_key ?? provider_key_slug;
      currentConfig.prompt_uuid = promptUUID;
      currentConfig.prompt_version_id = prompt_version_id;
      const { requestBody: overrideParams } = createRequestFromPromptData(
        {},
        promptMap[currentConfig.prompt_id],
        promptPartialMap,
        requestBody,
        currentConfig.prompt_id
      );
      currentConfig.override_params = {
        ...overrideParams,
        ...currentConfig.override_params,
      };
    } else if (!currentConfig.targets && currentConfig.virtual_key) {
      // If only virtual key is present in prompt config, then add the promptID from url.
      const { id: promptUUID, prompt_version_id } = promptMap[promptIDFromURL];
      currentConfig.prompt_id = promptIDFromURL;
      currentConfig.virtual_key = currentConfig.virtual_key;
      currentConfig.prompt_uuid = promptUUID;
      currentConfig.prompt_version_id = prompt_version_id;
      const { requestBody: overrideParams } = createRequestFromPromptData(
        {},
        promptMap[currentConfig.prompt_id],
        promptPartialMap,
        requestBody,
        currentConfig.prompt_id
      );
      currentConfig.override_params = {
        ...overrideParams,
        ...currentConfig.override_params,
      };
    }

    if (currentConfig.targets) {
      for (const target of currentConfig.targets) {
        recursiveAddPromptsToTarget(target);
      }
    }
  }

  recursiveAddPromptsToTarget(mappedConfig);

  return mappedConfig;
};

const getIntegrationCredentials = (
  integrationsMap: Array<any>,
  apiKey: string,
  checkId: string,
  incomingCredentials: Record<string, any> | undefined
) => {
  if (incomingCredentials && typeof incomingCredentials === 'object') {
    return incomingCredentials;
  }
  const checkProvider = checkId.split('.')[0];
  const integration = integrationsMap.find(
    (integration: any) => integration.integration_slug === checkProvider
  );
  if (integration) {
    return { ...integration.credentials };
  }
  if (checkProvider === 'portkey') {
    return { apiKey };
  }

  return {};
};

const isCheckAllowed = (organisationSettings: any, checkId: string) => {
  const checkProvider = checkId.split('.')[0];
  if (
    organisationSettings?.allowed_guardrails?.includes(
      GUARDRAIL_CATEGORY_FLAG_MAP[checkProvider]
    ) === false
  ) {
    return false;
  }

  return true;
};

export const getGuardrailMappedConfig = (
  guardrailMap: Record<string, any>,
  config: Record<string, any>,
  integrationsMap: any,
  apiKey: string,
  organisationSettings: any
) => {
  const mappedConfig = { ...config };

  const addGuardrailToHook = (hook: any, isShorthand: boolean) => {
    // If hook is a string, convert it to an object with id
    if (isShorthand) {
      const hookId = typeof hook === 'string' ? hook : hook.id;
      if (!guardrailMap[hookId]) {
        // If raw checks are sent in shorthand, then add the credentials and is_enabled
        if (hook && typeof hook === 'object') {
          Object.keys(hook)
            .filter((key) => key.split('.').length === 2)
            .forEach((key) => {
              const integrationCredentials = getIntegrationCredentials(
                integrationsMap,
                apiKey,
                key,
                hook[key]?.credentials
              );
              let isEnabled =
                typeof hook[key]?.is_enabled === 'boolean'
                  ? hook[key]?.is_enabled
                  : true;
              if (isEnabled) {
                isEnabled = isCheckAllowed(organisationSettings, key);
              }
              hook[key] = {
                ...hook[key],
                credentials: integrationCredentials,
                is_enabled: isEnabled,
              };
            });
        }
        return hook;
      }
      const { checks, actions, version_id } = guardrailMap[hookId];
      const checksObject = checks.reduce(
        (acc: Record<string, any>, check: any) => {
          let isEnabled =
            typeof check?.is_enabled === 'boolean' ? check?.is_enabled : true;
          if (isEnabled) {
            isEnabled = isCheckAllowed(organisationSettings, check.id);
          }
          acc[check.id] = {
            ...check.parameters,
            is_enabled: isEnabled,
            credentials: getIntegrationCredentials(
              integrationsMap,
              apiKey,
              check.id,
              check.parameters?.credentials
            ),
            // Exclude id since it's now the key
            id: undefined,
          };
          return acc;
        },
        {}
      );

      return {
        id: hookId,
        ...checksObject,
        guardrail_version_id: version_id,
        on_fail: hook.on_fail || actions.on_fail,
        on_success: hook.on_success || actions.on_success,
        deny: typeof hook.deny === 'boolean' ? hook.deny : actions.deny,
        async: typeof hook.async === 'boolean' ? hook.async : actions.async,
      };
    }

    const { checks, actions = {}, version_id } = guardrailMap[hook.id] || hook;

    Object.assign(hook, {
      checks,
      type: hook.type || 'guardrail',
      guardrail_version_id: version_id,
      on_fail: hook.on_fail || actions.on_fail,
      on_success: hook.on_success || actions.on_success,
      deny: typeof hook.deny === 'boolean' ? hook.deny : actions.deny,
      async: typeof hook.async === 'boolean' ? hook.async : actions.async,
    });

    hook.checks?.forEach((check: any) => {
      if (!check.parameters) {
        check.parameters = {};
      }
      let isEnabled =
        typeof check?.is_enabled === 'boolean' ? check?.is_enabled : true;
      if (isEnabled) {
        isEnabled = isCheckAllowed(organisationSettings, check.id);
      }
      check.parameters.credentials = getIntegrationCredentials(
        integrationsMap,
        apiKey,
        check.id,
        check.parameters.credentials
      );
      check.is_enabled = isEnabled;
    });
    return hook;
  };

  const processHooks = (hooks: any[] = [], isShorthand: boolean = false) => {
    // Map the hooks array and filter out any undefined values
    return hooks
      .map((hook) => addGuardrailToHook(hook, isShorthand))
      .filter(Boolean);
  };

  const recursiveAddGuardrailToHooks = (currentConfig: Record<string, any>) => {
    hookTypePresets.forEach((hookType) => {
      if (currentConfig[hookType]) {
        currentConfig[hookType] = processHooks(
          currentConfig[hookType],
          [
            HookTypePreset.INPUT_GUARDRAILS,
            HookTypePreset.INPUT_MUTATORS,
            HookTypePreset.OUTPUT_MUTATORS,
            HookTypePreset.OUTPUT_GUARDRAILS,
          ].includes(hookType)
        );
      }
    });

    currentConfig.targets?.forEach(recursiveAddGuardrailToHooks);
  };

  recursiveAddGuardrailToHooks(mappedConfig);

  return mappedConfig;
};

/**
 * Extracts unique prompt IDs from a nested/simple config object.
 *
 * @param {Object} config - The config object.
 * @returns {Array} An array of unique prompt IDs.
 */
export const getUniquePromptSlugsFromConfig = (
  config: Record<string, any>
): Array<string> => {
  const uniquePromptSlugs: Set<string> = new Set();

  function recursiveCollectPromptSlugsFromTarget(
    currentConfig: Record<string, any>
  ) {
    if (!currentConfig.targets && currentConfig.prompt_id) {
      uniquePromptSlugs.add(currentConfig.prompt_id);
    }
    if (currentConfig.targets) {
      for (const target of currentConfig.targets) {
        recursiveCollectPromptSlugsFromTarget(target);
      }
    }
  }

  recursiveCollectPromptSlugsFromTarget(config);

  return [...uniquePromptSlugs];
};

/**
 * Gets the config object with LLM API keys mapped based on the virtual keys present in it.
 *
 * @param {Record<string, any>} virtualKeyMap - A mapping of virtual keys to its provider data.
 * @param {Record<string, any>} config - The original config object that needs to be mapped with API keys.
 * @returns {Record<string, any>} - The mapped config object with mapped virtual keys.
 */
export const getApiKeyMappedConfig = (
  virtualKeyMap: Record<string, any>,
  config: Record<string, any>,
  body: Record<any, any>,
  mappedHeaders: Headers
): Record<string, any> => {
  const mappedConfig = { ...config };

  function recursiveAddKeysToTarget(
    currentConfig: Record<string, any>,
    configTargetType: string
  ) {
    if (
      !currentConfig[configTargetType] &&
      currentConfig.virtual_key &&
      virtualKeyMap[currentConfig.virtual_key]
    ) {
      const {
        key,
        ai_provider_name,
        model_config,
        status,
        usage_limits,
        rate_limits,
        integration_details: integrationDetails,
        id,
      } = virtualKeyMap[currentConfig.virtual_key];
      currentConfig.virtualKeyId = id;
      if (integrationDetails) {
        if (integrationDetails.status == EntityStatus.EXHAUSTED) {
          currentConfig.isIntegrationExhausted = true;
        }
        currentConfig.integrationId = integrationDetails.id;
        currentConfig.integrationSlug = integrationDetails.slug;
        currentConfig.integrationModelDetails = {
          allow_all_models: integrationDetails.allow_all_models,
          models: integrationDetails.models || [],
        };
        currentConfig.integrationUsageLimits =
          integrationDetails.usage_limits || null;
        currentConfig.integrationRateLimits =
          integrationDetails.rate_limits || null;
      }
      if (status == EntityStatus.EXHAUSTED) {
        currentConfig.isVirtualKeyExhausted = true;
      }
      if (status == EntityStatus.EXPIRED) {
        currentConfig.isVirtualKeyExpired = true;
      }
      const vkUsageLimits = Array.isArray(usage_limits)
        ? usage_limits
        : usage_limits
          ? [usage_limits]
          : [];
      currentConfig.virtualKeyUsageLimits = vkUsageLimits;
      currentConfig.virtualKeyRateLimits = rate_limits || [];
      currentConfig.provider = ai_provider_name;
      if (currentConfig.provider !== VERTEX_AI) {
        currentConfig.api_key = key;
      }

      if (model_config?.customHost) {
        currentConfig.custom_host =
          currentConfig.custom_host ?? model_config.customHost;
      }

      if (model_config?.customHeaders) {
        const keys = mapCustomHeaders(
          model_config.customHeaders,
          mappedHeaders
        );
        let forwardHeaders: string[] = currentConfig?.forward_headers || [];
        forwardHeaders = [...forwardHeaders, ...keys];
        currentConfig.forward_headers = forwardHeaders;
      }

      if (currentConfig.provider === AZURE_OPEN_AI && model_config) {
        const { deployments } = model_config;
        let deploymentConfig;
        // Fetch override params for current config
        const currentConfigOverrideParams = currentConfig.override_params;
        const alias = currentConfigOverrideParams?.model ?? body['model'];
        if (deployments) {
          if (alias) {
            deploymentConfig = deployments.find(
              (_config: any) => _config.alias === alias
            );
          }
          if (!deploymentConfig) {
            deploymentConfig = deployments.find(
              (_config: any) => _config.is_default
            );
          }
        }

        if (deployments && !deploymentConfig) {
          return {
            status: 'failure',
            message: 'No azure alias passed/default config found',
          };
        }
        currentConfig.resource_name = model_config.resourceName;
        currentConfig.azure_auth_mode = model_config.azureAuthMode;
        currentConfig.azure_managed_client_id =
          model_config.azureManagedClientId;
        currentConfig.azure_entra_client_id = model_config.azureEntraClientId;
        currentConfig.azure_entra_client_secret =
          model_config.azureEntraClientSecret;
        currentConfig.azure_entra_tenant_id = model_config.azureEntraTenantId;
        if (deploymentConfig) {
          currentConfig.deployment_id = deploymentConfig.deploymentName;
          currentConfig.api_version = deploymentConfig.apiVersion;
          currentConfig.azure_model_name = deploymentConfig.aiModelName;
        } else {
          currentConfig.deployment_id = model_config.deploymentName;
          currentConfig.api_version = model_config.apiVersion;
          currentConfig.azure_model_name = model_config.aiModelName;
        }
      }

      if (currentConfig.provider === AZURE_AI && model_config) {
        if (model_config.azureFoundryUrl) {
          currentConfig.azure_foundry_url = model_config.azureFoundryUrl;
        } else {
          const foundryURL = constructAzureFoundryURL({
            azureDeploymentName: model_config?.azureDeploymentName,
            azureDeploymentType: model_config?.azureDeploymentType,
            azureEndpointName: model_config?.azureEndpointName,
            azureRegion: model_config?.azureRegion,
          });
          currentConfig.azure_foundry_url = foundryURL;
        }

        currentConfig.azure_deployment_name = model_config.azureDeploymentName;
        currentConfig.azure_api_version = model_config.azureApiVersion;

        currentConfig.azure_auth_mode = model_config.azureAuthMode;
        currentConfig.azure_managed_client_id =
          model_config.azureManagedClientId;
        currentConfig.azure_entra_client_id = model_config.azureEntraClientId;
        currentConfig.azure_entra_client_secret =
          model_config.azureEntraClientSecret;
        currentConfig.azure_entra_tenant_id = model_config.azureEntraTenantId;
      }

      if (
        [BEDROCK, SAGEMAKER].includes(currentConfig.provider) &&
        model_config
      ) {
        const {
          awsAuthType,
          awsAccessKeyId,
          awsSecretAccessKey,
          awsRegion,
          awsRoleArn,
          awsExternalId,
        } = model_config;
        currentConfig.aws_auth_type = awsAuthType;
        currentConfig.aws_secret_access_key = awsSecretAccessKey;
        currentConfig.aws_region = awsRegion;
        currentConfig.aws_access_key_id = awsAccessKeyId;
        currentConfig.aws_role_arn = awsRoleArn;
        currentConfig.aws_external_id = awsExternalId;
      }

      if (currentConfig.provider === SAGEMAKER && model_config) {
        const {
          amznSagemakerCustomAttributes,
          amznSagemakerTargetModel,
          amznSagemakerTargetVariant,
          amznSagemakerTargetContainerHostname,
          amznSagemakerInferenceId,
          amznSagemakerEnableExplanations,
          amznSagemakerInferenceComponent,
          amznSagemakerSessionId,
          amznSagemakerModelName,
        } = model_config;
        currentConfig.amzn_sagemaker_custom_attributes =
          currentConfig.amzn_sagemaker_custom_attributes ||
          amznSagemakerCustomAttributes;
        currentConfig.amzn_sagemaker_target_model =
          currentConfig.amzn_sagemaker_target_model || amznSagemakerTargetModel;
        currentConfig.amzn_sagemaker_target_variant =
          currentConfig.amzn_sagemaker_target_variant ||
          amznSagemakerTargetVariant;
        currentConfig.amzn_sagemaker_target_container_hostname =
          currentConfig.amzn_sagemaker_target_container_hostname ||
          amznSagemakerTargetContainerHostname;
        currentConfig.amzn_sagemaker_inference_id =
          currentConfig.amzn_sagemaker_inference_id || amznSagemakerInferenceId;
        currentConfig.amzn_sagemaker_enable_explanations =
          currentConfig.amzn_sagemaker_enable_explanations ||
          amznSagemakerEnableExplanations;
        currentConfig.amzn_sagemaker_inference_component =
          currentConfig.amzn_sagemaker_inference_component ||
          amznSagemakerInferenceComponent;
        currentConfig.amzn_sagemaker_sessionId =
          currentConfig.amzn_sagemaker_sessionId || amznSagemakerSessionId;
        currentConfig.amzn_sagemaker_model_name =
          currentConfig.amzn_sagemaker_model_name || amznSagemakerModelName;
      }

      if (currentConfig.provider === VERTEX_AI && model_config) {
        currentConfig.vertex_project_id = model_config.vertexProjectId;
        currentConfig.vertex_region =
          currentConfig.vertex_region || model_config.vertexRegion;
        currentConfig.vertex_service_account_json =
          model_config.vertexServiceAccountJson;
      }

      if (currentConfig.provider === WORKERS_AI && model_config) {
        currentConfig.workers_ai_account_id = model_config.workersAiAccountId;
      }

      if (currentConfig.provider === OPEN_AI && model_config) {
        if (model_config.openaiOrganization) {
          currentConfig.openai_organization = model_config.openaiOrganization;
        }

        if (model_config.openaiProject) {
          currentConfig.openai_project = model_config.openaiProject;
        }
      }
    }

    if (currentConfig[configTargetType]) {
      for (const target of currentConfig[configTargetType]) {
        recursiveAddKeysToTarget(target, configTargetType);
      }
    }
  }

  const configTargetType = mappedConfig.options?.length ? 'options' : 'targets';

  recursiveAddKeysToTarget(mappedConfig, configTargetType);

  return mappedConfig;
};

export const getConfigDetailsFromRequest = (
  requestHeaders: Record<string, any>,
  requestBody: Record<string, any>,
  path: string
) => {
  const mode = getMode(requestHeaders, path);
  const isHeaderConfigEnabledRequest = [
    MODES.PROXY,
    MODES.PROXY_V2,
    MODES.RUBEUS_V2,
  ].includes(mode);

  const isBodyConfigEnabledRequest = [MODES.RUBEUS].includes(mode);

  const configHeader = requestHeaders.get(HEADER_KEYS.CONFIG);

  if (isBodyConfigEnabledRequest) {
    if (typeof requestBody.config === 'string') {
      return {
        type: 'slug',
        data: requestBody.config,
      };
    } else if (typeof requestBody.config === 'object') {
      return {
        type: 'object',
        data: requestBody.config,
      };
    }
  }

  if (isHeaderConfigEnabledRequest && configHeader) {
    if (configHeader.startsWith('pc-')) {
      return {
        type: 'slug',
        data: requestHeaders.get(HEADER_KEYS.CONFIG),
      };
    } else {
      try {
        const parsedConfigJSON = JSON.parse(configHeader);
        return {
          type: 'object',
          data: parsedConfigJSON,
        };
      } catch (e) {
        console.log('invalid config', e);
      }
    }
  }

  return null;
};

// This function can be extended to do any further config mapping.
// Currently, this only replaces virtual key.
export const getMappedConfig = async (
  env: any,
  config: Record<string, any>,
  apiKey: string,
  organisationDetails: OrganisationDetails,
  requestBody: Record<string, any>,
  path: string,
  isVirtualKeyUsageEnabled: boolean,
  mappedHeaders: Headers,
  defaultGuardrails: BaseGuardrail[],
  configSlug: string
) => {
  const {
    id: organisationId,
    workspaceDetails,
    settings: organisationSettings,
  } = organisationDetails;

  // Create circuit breaker context
  let circuitBreakerContext: CircuitBreakerContext | null = null;
  let updatedCircuitBreakerContext: CircuitBreakerContext | null = null;
  if (configSlug) {
    const configId = generateCircuitBreakerConfigId(
      configSlug,
      workspaceDetails.id,
      organisationId
    );
    circuitBreakerContext = extractCircuitBreakerConfigs(config, configId);
    // Check circuit breaker status
    updatedCircuitBreakerContext = await checkCircuitBreakerStatus(
      env,
      circuitBreakerContext
    );
  }

  let promptIDFromURL: string = '';

  const isPromptCompletionsCall = path.startsWith('/v1/prompts/')
    ? true
    : false;
  if (isPromptCompletionsCall) {
    promptIDFromURL = path.split('/')[3];
  }
  const promptSlugArr = getUniquePromptSlugsFromConfig(config);

  const isPromptCompletionsConfig = promptSlugArr.length > 0 ? true : false;

  if (promptIDFromURL && !promptSlugArr.includes(promptIDFromURL)) {
    promptSlugArr.push(promptIDFromURL);
  }

  // configs with prompt_id are only allowed in /v1/prompts route
  if (!isPromptCompletionsCall && promptSlugArr.length) {
    return {
      status: 'error',
      message: `You cannot pass config with prompt id in /v1/prompts route`,
    };
  }
  const { promptMap, missingPrompts } = await getPromptMap(
    env,
    promptSlugArr,
    apiKey,
    organisationId,
    workspaceDetails
  );
  if (missingPrompts.length > 0) {
    return {
      status: 'error',
      message: `Following prompt_id are not valid: ${missingPrompts.join(
        ', '
      )}`,
    };
  }

  const { missingVariablePartials, uniquePartials } =
    getUniquePromptPartialsFromPromptMap(promptMap, requestBody);
  if (missingVariablePartials.length > 0) {
    return {
      status: 'error',
      message: `Missing variable partials: ${missingVariablePartials.join(
        ', '
      )}`,
    };
  }
  const { promptPartialMap, missingPromptPartials } = await getPromptPartialMap(
    env,
    uniquePartials,
    apiKey,
    organisationId,
    workspaceDetails
  );
  if (missingPromptPartials.length > 0) {
    return {
      status: 'error',
      message: `Missing prompt partials: ${missingPromptPartials.join(', ')}`,
    };
  }

  const promptMappedConfig = isPromptCompletionsConfig
    ? getPromptMappedConfig(
        promptMap,
        promptPartialMap,
        config,
        requestBody,
        promptIDFromURL
      )
    : config;

  const virtualKeyArr = getUniqueVirtualKeysFromConfig(promptMappedConfig);
  const { virtualKeyMap, missingKeys } = await getVirtualKeyMap(
    env,
    virtualKeyArr,
    apiKey,
    organisationId,
    workspaceDetails
  );
  if (missingKeys.length > 0) {
    return {
      status: 'error',
      message: `Following keys are not valid: ${missingKeys.join(', ')}`,
    };
  }

  const { uniqueGuardrails: guardrailKeyArr, rawHooksPresent } =
    getUniqueGuardrailsFromConfig(promptMappedConfig);
  const mappedGuardrailKeyArr: BaseGuardrail[] = guardrailKeyArr.map(
    (guardrail) => ({
      slug: guardrail,
      organisationId,
      workspaceId: workspaceDetails.id,
    })
  );

  let integrations;
  if (
    guardrailKeyArr.length > 0 ||
    rawHooksPresent ||
    defaultGuardrails.length > 0
  ) {
    integrations = await fetchOrganisationIntegrations(
      env,
      organisationId,
      apiKey,
      false
    );
  }

  defaultGuardrails.forEach((guardrail) => {
    if (!guardrailKeyArr.includes(guardrail.slug)) {
      mappedGuardrailKeyArr.push(guardrail);
    }
  });

  const { guardrailMap, missingGuardrails } = await getGuardrailMap(
    env,
    mappedGuardrailKeyArr
  );

  if (missingGuardrails.length > 0) {
    return {
      status: 'error',
      message: `Following guardrails are not valid: ${missingGuardrails.join(
        ', '
      )}`,
    };
  }

  let promptRequestURL = '';
  // For /v1/prompts with prompt_id configs, generate a request url based on modelType
  if (
    isPromptCompletionsConfig &&
    Object.values(promptMap)[0]?.ai_model_type === 'chat'
  ) {
    promptRequestURL = `${env.GATEWAY_BASEPATH}/chat/completions`;
  } else if (
    isPromptCompletionsConfig &&
    Object.values(promptMap)[0]?.ai_model_type === 'text'
  ) {
    promptRequestURL = `${env.GATEWAY_BASEPATH}/completions`;
  }

  const guardrailMappedConfig = getGuardrailMappedConfig(
    guardrailMap,
    config,
    integrations,
    apiKey,
    organisationSettings
  );

  if (Object.keys(virtualKeyMap).length === 0) {
    return {
      status: 'success',
      data: guardrailMappedConfig,
      promptRequestURL: promptRequestURL,
      guardrailMap: guardrailMap,
      integrations: integrations,
      circuitBreakerContext: null,
    };
  }

  const apiKeyMappedConfig = getApiKeyMappedConfig(
    virtualKeyMap,
    guardrailMappedConfig,
    requestBody,
    mappedHeaders
  );
  // Apply circuit breaker status to config
  const circuitBreakerMappedConfig = updatedCircuitBreakerContext
    ? getCircuitBreakerMappedConfig(
        apiKeyMappedConfig,
        updatedCircuitBreakerContext
      )
    : apiKeyMappedConfig;

  return {
    status: 'success',
    data: circuitBreakerMappedConfig,
    promptRequestURL: promptRequestURL,
    guardrailMap: guardrailMap,
    integrations: integrations,
    circuitBreakerContext: updatedCircuitBreakerContext,
  };
};

export const getUniquePromptPartialsFromPromptMap = (
  promptMap: Record<string, any>,
  requestBodyJSON: Record<string, any>
): {
  missingVariablePartials: string[];
  uniquePartials: string[];
} => {
  const missingVariablePartials: string[] = [];
  const uniquePartials = new Set<string>();

  // Loop over each prompt in the map
  Object.values(promptMap).forEach((promptData) => {
    if (promptData.variable_components) {
      // Safely parse variableComponents, which can contain various properties
      const components = JSON.parse(promptData.variable_components);

      // Check and add 'partials' if they exist
      if (Array.isArray(components.partials)) {
        components.partials.forEach((partial: string) =>
          uniquePartials.add(partial)
        );
      }

      // Check and add 'variablePartials' if they exist. Variable partial values are resolved from the request body
      if (Array.isArray(components.variablePartials)) {
        components.variablePartials.forEach((eachVariablePartial: string) => {
          if (
            requestBodyJSON.variables &&
            requestBodyJSON.variables.hasOwnProperty(eachVariablePartial)
          ) {
            uniquePartials.add(requestBodyJSON.variables[eachVariablePartial]);
          } else {
            missingVariablePartials.push(eachVariablePartial);
          }
        });
      }
    }
  });

  // Convert the Set to an array to return the unique partials
  return {
    missingVariablePartials: [...missingVariablePartials],
    uniquePartials: [...uniquePartials],
  };
};

export const getMappedConfigFromRequest = async (
  env: any,
  requestBody: Record<string, any>,
  requestHeaders: Headers,
  orgApiKey: string,
  organisationDetails: OrganisationDetails,
  path: string,
  isVirtualKeyUsageEnabled: boolean,
  mappedHeaders: Headers,
  defaultGuardrails: BaseGuardrail[]
) => {
  const { id: organisationId, workspaceDetails } = organisationDetails;
  const configDetails = getConfigDetailsFromRequest(
    requestHeaders,
    requestBody,
    path
  );
  if (!configDetails) {
    let guardrailMap;
    let integrations;
    if (defaultGuardrails.length > 0) {
      const guardrails = await getGuardrailMap(env, defaultGuardrails);

      guardrailMap = guardrails.guardrailMap;
      if (guardrails.missingGuardrails.length > 0) {
        return {
          status: 'failure',
          message: `Following default guardrails are not valid: ${guardrails.missingGuardrails.join(
            ', '
          )}`,
        };
      }
      integrations = await fetchOrganisationIntegrations(
        env,
        organisationId,
        orgApiKey,
        false
      );
    }
    return {
      status: 'success',
      mappedConfig: null,
      configVersion: null,
      configSlug: null,
      promptRequestURL: null,
      guardrailMap: guardrailMap,
      integrations: integrations,
    };
  }
  const store: Record<string, any> = {};
  if (configDetails.type === 'slug') {
    const orgConfigFromSlug = await fetchOrganisationConfig(
      env,
      orgApiKey,
      organisationId,
      workspaceDetails,
      configDetails.data
    );
    if (!orgConfigFromSlug) {
      return {
        status: 'failure',
        message: 'Invalid config id passed',
      };
    }
    store.organisationConfig = {
      ...orgConfigFromSlug.organisationConfig,
    };
    store.configVersion = orgConfigFromSlug.configVersion;
    store.configSlug = configDetails.data;
  } else if (configDetails.type === 'object') {
    store.organisationConfig = {
      ...configDetails.data,
    };
  }

  const mappedConfig = await getMappedConfig(
    env,
    store.organisationConfig,
    orgApiKey,
    organisationDetails,
    requestBody,
    path,
    isVirtualKeyUsageEnabled,
    mappedHeaders,
    defaultGuardrails,
    store.configSlug
  );
  if (mappedConfig.status === 'error') {
    return {
      status: 'failure',
      message: mappedConfig.message,
    };
  }

  return {
    status: 'success',
    mappedConfig: mappedConfig.data,
    configVersion: store.configVersion,
    configSlug: store.configSlug,
    promptRequestURL: mappedConfig.promptRequestURL,
    guardrailMap: mappedConfig.guardrailMap,
    integrations: mappedConfig.integrations,
    circuitBreakerContext: mappedConfig.circuitBreakerContext,
  };
};

/**
 * Handles the mapping of virtual key header to provider and authorization header
 *
 * @param {Object} env - Hono environment object.
 * @param {string} orgApiKey - The organization's API key.
 * @param {string} organisationId - The organization's ID.
 * @param {Headers} headers - Original request headers object
 * @param {string} mode - The mode for the request. Decided on the basis of route that is called
 * @returns {Promise<{status: string, message?: string}>} - A promise resolving to an object
 * with the status success/failure and an optional message in case of failure.
 */
export const handleVirtualKeyHeader = async (
  env: any,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails,
  headers: Headers,
  mode: string,
  requestBody: Record<string, any>,
  mappedURL: string
): Promise<{ status: string; message?: string }> => {
  const virtualKeyDetailsFromModel = getVirtualKeyFromModel(requestBody?.model);
  let virtualKeyFromModel: string | undefined;
  let mappedModelName: string | undefined;
  if (virtualKeyDetailsFromModel) {
    virtualKeyFromModel = virtualKeyDetailsFromModel.virtualKey;
    mappedModelName = virtualKeyDetailsFromModel.model;
  }
  const virtualKey = headers.get(HEADER_KEYS.PROVIDER)?.startsWith('@')
    ? headers.get(HEADER_KEYS.PROVIDER)?.slice(1).split('/')[0]
    : headers.get(HEADER_KEYS.VIRTUAL_KEY)
      ? headers.get(HEADER_KEYS.VIRTUAL_KEY)
      : virtualKeyFromModel
        ? virtualKeyFromModel
        : null;

  if (!virtualKey) {
    return {
      status: 'success',
    };
  }

  if (requestBody?.model && mappedModelName && virtualKeyFromModel) {
    requestBody.model = mappedModelName;
  }

  headers.set(HEADER_KEYS.VIRTUAL_KEY, virtualKey);
  const apiKeyKVRecord = await fetchOrganisationProviderFromSlug(
    env,
    orgApiKey,
    organisationId,
    workspaceDetails,
    virtualKey
  );
  if (!apiKeyKVRecord) {
    return {
      status: 'failure',
      message: `Following keys are not valid: ${headers.get(
        HEADER_KEYS.VIRTUAL_KEY
      )}`,
    };
  }

  const {
    id: virtualKeyId,
    ai_provider_name,
    key,
    model_config,
    status,
    usage_limits,
    rate_limits: rateLimits,
    slug,
    expires_at,
    integration_details: integrationDetails,
  } = apiKeyKVRecord;

  if (integrationDetails) {
    headers.set(
      HEADER_KEYS.INTEGRATION_DETAILS,
      JSON.stringify({
        id: integrationDetails.id,
        slug: integrationDetails.slug,
        status: integrationDetails.status,
        allow_all_models: integrationDetails.allow_all_models,
        models: integrationDetails.models || [],
        usage_limits: integrationDetails.usage_limits || [],
        rate_limits: integrationDetails.rate_limits || [],
      })
    );
  }

  const usageLimits = Array.isArray(usage_limits)
    ? usage_limits
    : usage_limits
      ? [usage_limits]
      : [];

  const virtualKeyDetails: VirtualKeyDetails = {
    status,
    usage_limits: usageLimits || [],
    rate_limits: rateLimits || [],
    id: virtualKeyId,
    workspace_id: workspaceDetails.id,
    slug,
    organisation_id: organisationId,
    expires_at: expires_at,
  };

  headers.set(
    HEADER_KEYS.VIRTUAL_KEY_DETAILS,
    JSON.stringify(virtualKeyDetails)
  );

  const currentCustomHost = headers.get(HEADER_KEYS.CUSTOM_HOST);
  if (model_config?.customHost && !currentCustomHost) {
    headers.set(HEADER_KEYS.CUSTOM_HOST, model_config.customHost);
  }

  if (
    providerAuthHeaderMap[ai_provider_name] &&
    ![MODES.RUBEUS_V2, MODES.REALTIME].includes(mode)
  ) {
    headers.set(
      providerAuthHeaderMap[ai_provider_name],
      `${providerAuthHeaderPrefixMap[ai_provider_name]}${key}`
    );
  } else if (ai_provider_name !== VERTEX_AI) {
    headers.set('authorization', `Bearer ${key}`);
  }

  // Order is important, headers can contain `authorization` which should be overriden if custom LLM.
  if (model_config?.customHeaders) {
    const allkeys = mapCustomHeaders(model_config.customHeaders, headers);
    // Get current forward headers
    const currentForwardHeaders = headers.get(HEADER_KEYS.FORWARD_HEADERS);

    const finalHeaders =
      allkeys.join(',') +
      (currentForwardHeaders ? `,${currentForwardHeaders}` : '');
    // Set forward headers
    headers.set(HEADER_KEYS.FORWARD_HEADERS, finalHeaders);
  }

  // Azure OpenAI requires `Authorization` header for finetuning & files routes.
  if (
    ai_provider_name === AZURE_OPEN_AI &&
    (mappedURL.includes('/fine_tuning') || mappedURL.includes('/files'))
  ) {
    headers.set('authorization', `Bearer ${key}`);
  }

  if (ai_provider_name === AZURE_OPEN_AI && model_config) {
    const {
      resourceName,
      deploymentName,
      apiVersion,
      aiModelName,
      azureAuthMode,
      azureManagedClientId,
      azureEntraTenantId,
      azureEntraClientId,
      azureEntraClientSecret,
      deployments,
    } = model_config;
    const azureDeploymentAlias = requestBody['model'];
    // New Config
    let deploymentConfig;
    if (deployments) {
      if (azureDeploymentAlias) {
        deploymentConfig = deployments.find(
          (_config: any) => _config.alias === azureDeploymentAlias
        );
      }
      // Fallback to default model in-case we didn't fine any alias in the vk config.
      if (!deploymentConfig) {
        deploymentConfig = deployments.find(
          (_config: any) => _config.is_default
        );
      }
    }

    if (deployments && !deploymentConfig) {
      return {
        status: 'failure',
        message: 'No azure alias passed/default config found',
      };
    }

    headers.set(HEADER_KEYS.AZURE_RESOURCE, resourceName?.toString() ?? '');
    headers.set(HEADER_KEYS.AZURE_AUTH_MODE, azureAuthMode ?? '');
    headers.set(
      HEADER_KEYS.AZURE_MANAGED_CLIENT_ID,
      azureManagedClientId ?? ''
    );
    headers.set(HEADER_KEYS.AZURE_ENTRA_CLIENT_ID, azureEntraClientId ?? '');
    headers.set(
      HEADER_KEYS.AZURE_ENTRA_CLIENT_SECRET,
      azureEntraClientSecret ?? ''
    );
    headers.set(HEADER_KEYS.AZURE_ENTRA_TENANT_ID, azureEntraTenantId ?? '');
    if (deploymentConfig) {
      headers.set(
        HEADER_KEYS.AZURE_DEPLOYMENT,
        deploymentConfig.deploymentName?.toString() ?? ''
      );
      headers.set(
        HEADER_KEYS.AZURE_API_VERSION,
        deploymentConfig.apiVersion?.toString() ?? ''
      );
      headers.set(
        HEADER_KEYS.AZURE_MODEL_NAME,
        deploymentConfig.aiModelName?.toString() ?? ''
      );
    } else {
      headers.set(
        HEADER_KEYS.AZURE_DEPLOYMENT,
        deploymentName?.toString() ?? ''
      );
      headers.set(HEADER_KEYS.AZURE_API_VERSION, apiVersion?.toString() ?? '');
      headers.set(HEADER_KEYS.AZURE_MODEL_NAME, aiModelName?.toString() ?? '');
    }
  }

  if (ai_provider_name === AZURE_AI) {
    if (model_config?.azureFoundryUrl) {
      headers.set(
        HEADER_KEYS.AZURE_FOUNDRY_URL,
        model_config.azureFoundryUrl ?? ''
      );
    } else {
      const foundryURL = constructAzureFoundryURL({
        azureDeploymentName: model_config?.azureDeploymentName,
        azureDeploymentType: model_config?.azureDeploymentType,
        azureEndpointName: model_config?.azureEndpointName,
        azureRegion: model_config?.azureRegion,
      });
      headers.set(HEADER_KEYS.AZURE_FOUNDRY_URL, foundryURL ?? '');
      headers.set(
        HEADER_KEYS.AZURE_DEPLOYMENT_NAME,
        model_config?.azureDeploymentName ?? ''
      );
    }
    headers.set(
      HEADER_KEYS.AZURE_API_VERSION,
      model_config?.azureApiVersion ?? ''
    );
    headers.set(HEADER_KEYS.AZURE_AUTH_MODE, model_config?.azureAuthMode ?? '');
    headers.set(
      HEADER_KEYS.AZURE_MANAGED_CLIENT_ID,
      model_config?.azureManagedClientId ?? ''
    );
    headers.set(
      HEADER_KEYS.AZURE_ENTRA_CLIENT_ID,
      model_config?.azureEntraClientId ?? ''
    );
    headers.set(
      HEADER_KEYS.AZURE_ENTRA_CLIENT_SECRET,
      model_config?.azureEntraClientSecret ?? ''
    );
    headers.set(
      HEADER_KEYS.AZURE_ENTRA_TENANT_ID,
      model_config?.azureEntraTenantId ?? ''
    );
  }

  if ([BEDROCK, SAGEMAKER].includes(ai_provider_name) && model_config) {
    const {
      awsAuthType,
      awsAccessKeyId,
      awsSecretAccessKey,
      awsRegion,
      awsRoleArn,
      awsExternalId,
    } = model_config;

    headers.set(HEADER_KEYS.AWS_AUTH_TYPE, awsAuthType?.toString() ?? '');
    headers.set(HEADER_KEYS.AWS_ROLE_ARN, awsRoleArn?.toString() ?? '');
    headers.set(HEADER_KEYS.AWS_EXTERNAL_ID, awsExternalId?.toString() ?? '');

    headers.set(
      HEADER_KEYS.BEDROCK_ACCESS_KEY_ID,
      awsAccessKeyId?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.BEDROCK_SECRET_ACCESS_KEY,
      awsSecretAccessKey?.toString() ?? ''
    );
    headers.set(HEADER_KEYS.BEDROCK_REGION, awsRegion?.toString() ?? '');
    headers.delete('authorization');
  }

  if (ai_provider_name === SAGEMAKER && model_config) {
    const {
      amznSagemakerCustomAttributes,
      amznSagemakerTargetModel,
      amznSagemakerTargetVariant,
      amznSagemakerTargetContainerHostname,
      amznSagemakerInferenceId,
      amznSagemakerEnableExplanations,
      amznSagemakerInferenceComponent,
      amznSagemakerSessionId,
      amznSagemakerModelName,
    } = model_config;
    headers.set(
      HEADER_KEYS.SAGEMAKER_CUSTOM_ATTRIBUTES,
      amznSagemakerCustomAttributes?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.SAGEMAKER_ENABLE_EXPLANATIONS,
      amznSagemakerEnableExplanations?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.SAGEMAKER_INFERENCE_COMPONENT,
      amznSagemakerInferenceComponent?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.SAGEMAKER_INFERENCE_ID,
      amznSagemakerInferenceId?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.SAGEMAKER_SESSION_ID,
      amznSagemakerSessionId?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.SAGEMAKER_TARGET_CONTAINER_HOSTNAME,
      amznSagemakerTargetContainerHostname?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.SAGEMAKER_TARGET_MODEL,
      amznSagemakerTargetModel?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.SAGEMAKER_TARGET_VARIANT,
      amznSagemakerTargetVariant?.toString() ?? ''
    );
    headers.set(
      HEADER_KEYS.SAGEMAKER_MODEL_NAME,
      amznSagemakerModelName?.toString() ?? ''
    );
  }

  if (ai_provider_name === VERTEX_AI && model_config) {
    const { vertexProjectId, vertexRegion, vertexServiceAccountJson } =
      model_config;

    headers.set(
      HEADER_KEYS.VERTEX_AI_PROJECT_ID,
      vertexProjectId?.toString() ?? ''
    );

    if (!headers.get(HEADER_KEYS.VERTEX_AI_REGION)) {
      headers.set(HEADER_KEYS.VERTEX_AI_REGION, vertexRegion?.toString() ?? '');
    }

    if (vertexServiceAccountJson) {
      headers.set(
        HEADER_KEYS.VERTEX_SERVICE_ACCOUNT_JSON,
        JSON.stringify(vertexServiceAccountJson)
      );
    }
  }

  if (ai_provider_name === WORKERS_AI && model_config) {
    const { workersAiAccountId } = model_config;

    headers.set(
      HEADER_KEYS.WORKERS_AI_ACCOUNT_ID,
      workersAiAccountId?.toString() ?? ''
    );
  }

  if (ai_provider_name === OPEN_AI && model_config) {
    const { openaiOrganization, openaiProject } = model_config;

    if (openaiOrganization) {
      headers.set(
        HEADER_KEYS.OPEN_AI_ORGANIZATION,
        openaiOrganization?.toString() ?? ''
      );
    }

    if (openaiProject) {
      headers.set(HEADER_KEYS.OPEN_AI_PROJECT, openaiProject?.toString() ?? '');
    }
  }

  headers.set(HEADER_KEYS.PROVIDER, ai_provider_name);

  return {
    status: 'success',
  };
};

export const createRequestFromPromptData = (
  env: any,
  promptData: Record<string, any>,
  promptPartialMap: Record<string, any>,
  requestBodyJSON: Record<string, any>,
  promptSlug: string
) => {
  let promptString = promptData.string;

  const jsonCompatibleVariables: Record<string, any> = {};
  Object.keys(requestBodyJSON.variables).forEach((key) => {
    jsonCompatibleVariables[key] = requestBodyJSON.variables[key];
  });

  const finalPromptPartials: Record<string, string> = {};
  for (const key in promptPartialMap) {
    const partial = promptPartialMap[key];
    finalPromptPartials[key] = JSON.stringify(
      Mustache.render(partial.string, jsonCompatibleVariables, {})
    ).slice(1, -1);
  }

  try {
    promptString = Mustache.render(
      promptString,
      jsonCompatibleVariables,
      finalPromptPartials
    );
  } catch (e) {
    return {
      status: 'failure',
      message: `Error in parsing prompt template: ${e}`,
    };
  }

  const requestBody = {
    ...promptData.parameters_object,
  };

  delete requestBody['stream'];

  Object.entries(requestBodyJSON).forEach(([key, value]) => {
    requestBody[key] = value;
  });
  delete requestBody['variables'];

  const requestHeader = {
    [HEADER_KEYS.VIRTUAL_KEY]: promptData.provider_key_slug,
    [HEADER_KEYS.PROMPT_ID]: promptData.id,
    [HEADER_KEYS.PROMPT_VERSION_ID]: promptData.prompt_version_id,
    [HEADER_KEYS.PROMPT_SLUG]: promptSlug,
  };

  if (promptData.template_metadata) {
    const metadata = JSON.parse(promptData.template_metadata);
    if (metadata.azure_alias) {
      requestBody['model'] = metadata.azure_alias;
    }
  }

  let requestUrl = env.GATEWAY_BASEPATH;

  if (promptData.ai_model_type === 'chat') {
    requestBody.messages = JSON.parse(promptString);
    requestUrl += '/chat/completions';
  } else {
    requestBody.prompt = promptString;
    requestUrl += '/completions';
  }
  return { requestBody, requestHeader, requestUrl };
};

export const checkRateLimits = async (
  env: any,
  organisationId: string,
  rateLimitObject: RateLimit,
  value: string,
  type: string,
  units: number
) => {
  const apiRateLimiterStub = env.API_RATE_LIMITER.get(
    env.API_RATE_LIMITER.idFromName(
      `${organisationId}-${rateLimitObject.type}-${type}-${value}`
    )
  );
  const apiRes = await apiRateLimiterStub.fetch(
    'https://api.portkey.ai/v1/health',
    {
      method: 'POST',
      body: JSON.stringify({
        windowSize: RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[rateLimitObject.unit],
        capacity: rateLimitObject.value,
        units,
      }),
    }
  );

  const apiMillisecondsToNextRequest = await apiRes.json();

  if (apiMillisecondsToNextRequest > 0) {
    return {
      status: false,
      waitTime: apiMillisecondsToNextRequest,
    };
  }

  return {
    allowed: true,
    waitTime: apiMillisecondsToNextRequest,
  };
};

export const getRateLimit = async (
  env: any,
  organisationId: string,
  rateLimitObject: RateLimit,
  value: string,
  type: RateLimiterKeyTypes
) => {
  const apiRateLimiterStub = env.API_RATE_LIMITER.get(
    env.API_RATE_LIMITER.idFromName(
      `${organisationId}-${rateLimitObject.type}-${type}-${value}`
    )
  );
  const resp = await apiRateLimiterStub.fetch(
    'https://api.portkey.ai/v1/health',
    {
      method: 'POST',
      body: JSON.stringify({
        windowSize: RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[rateLimitObject.unit],
        capacity: rateLimitObject.value,
        getTokens: true,
      }),
    }
  );
  const tokenResp = await resp.json();
  return tokenResp.tokens;
};
