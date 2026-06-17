export interface WonderfenceCredentials {
  apiKey?: string;
  // V2: app is identified per-request by a UUID (appId), not appName.
  appId?: string;
  baseUrl?: string;
}
