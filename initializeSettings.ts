export const defaultOrganisationDetails = {
  id: 'self-hosted-organisation',
  name: 'Portkey self hosted',
  settings: {
    debug_log: 1,
    is_virtual_key_limit_enabled: 1,
    allowed_guardrails: ['BASIC', 'PARTNER', 'PRO'],
  },
  workspaceDetails: {},
  defaults: {
    metadata: null,
  },
  usageLimits: [],
  rateLimits: [],
  organisationDefaults: {
    input_guardrails: null,
  },
};

const transformIntegrations = (integrations: any) => {
  return integrations.map((integration: any) => {
    return {
      id: integration.slug, //need to do consistent hashing for caching
      ai_provider_name: integration.provider,
      model_config: {
        ...integration.credentials,
      },
      ...(integration.credentials?.apiKey && {
        key: integration.credentials.apiKey,
      }),
      slug: integration.slug,
      usage_limits: null,
      status: 'active',
      integration_id: integration.slug,
      object: 'virtual-key',
      integration_details: {
        id: integration.slug,
        slug: integration.slug,
        usage_limits: integration.usage_limits,
        rate_limits: integration.rate_limits,
        models: integration.models,
        allow_all_models: integration.allow_all_models,
      },
    };
  });
};

export const getSettings = async () => {
  try {
    const isFetchSettingsFromFile =
      process?.env?.FETCH_SETTINGS_FROM_FILE === 'true';
    if (!isFetchSettingsFromFile) {
      return undefined;
    }
    let settings: any = undefined;
    const { readFile } = await import('fs/promises');
    const settingsFile = await readFile('./conf.json', 'utf-8');
    const settingsFileJson = JSON.parse(settingsFile);

    if (settingsFileJson) {
      settings = {};
      settings.organisationDetails = defaultOrganisationDetails;
      if (settingsFileJson.integrations) {
        settings.integrations = transformIntegrations(
          settingsFileJson.integrations
        );
      }
      return settings;
    }
  } catch (error) {
    console.log(
      'WARNING: unable to load settings from your conf.json file',
      error
    );
  }
};
