import {
  getSettings,
  defaultOrganisationDetails,
} from '../../../../initializeSettings';

export const fetchOrganisationProviderFromSlugFromFile = async (
  url: string
) => {
  const settings = await getSettings();
  const virtualKeySlug = url.split('/').pop()?.split('?')[0];
  return settings.integrations.find(
    (integration: any) => integration.slug === virtualKeySlug
  );
};

// not supported
// export const fetchOrganisationConfig = async () => {
//   return fetchFromJson('organisationConfig');
// };

// not supported
// export const fetchOrganisationPrompt = async () => {
//   return fetchFromJson('organisationPrompt');
// };

// not supported
// export const fetchOrganisationPromptPartial = async () => {
//   return fetchFromJson('organisationPromptPartial');
// };

// not supported
// export const fetchOrganisationGuardrail = async () => {
//   return fetchFromJson('organisationGuardrail');
// };

export const fetchOrganisationDetailsFromFile = async () => {
  const settings = await getSettings();
  return settings?.organisationDetails ?? defaultOrganisationDetails;
};

export const fetchOrganisationIntegrationsFromFile = async () => {
  // return settings.integrations;
};
