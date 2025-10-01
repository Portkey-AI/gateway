const organisationDetails = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Portkey self hosted',
  settings: {
    debug_log: 1,
    is_virtual_key_limit_enabled: 1,
    allowed_guardrails: ['BASIC'],
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
      id: '1234567890', //need to do consistent hashing for caching
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
      integration_id: '1234567890',
      object: 'virtual-key',
      integration_details: {
        id: '1234567890',
        slug: integration.slug,
        usage_limits: integration.usage_limits,
        rate_limits: integration.rate_limits,
        models: integration.models,
      },
    };
  });
};

let settings: any = undefined;
try {
  // @ts-expect-error
  const settingsFile = await import('./settings.json');
  if (settingsFile) {
    settings = {};
    settings.organisationDetails = organisationDetails;
    if (settingsFile.integrations) {
      settings.integrations = transformIntegrations(settingsFile.integrations);
    }
  }
} catch (error) {
  console.log(
    'WARNING: Unable to import settings from the path, please make sure the file exists',
    error
  );
}

export { settings };
