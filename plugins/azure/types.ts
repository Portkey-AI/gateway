export interface AzureCredentials {
  resourceName: string;
  azureAuthMode: 'apiKey' | 'entra' | 'managed' | 'azure_cli';
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  customHost?: string;
}
