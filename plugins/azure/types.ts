export interface AzureCredentials {
  resourceName: string;
  azureAuthMode: 'apiKey' | 'entra' | 'managed';
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  customHost?: string;
}
