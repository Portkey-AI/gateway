import { Context } from 'hono';
import { env, getRuntimeKey } from 'hono/adapter';

const isNodeInstance = getRuntimeKey() == 'node';
let path: any;
let fs: any;
if (isNodeInstance) {
  path = await import('path');
  fs = await import('fs');
}

export function getValueOrFileContents(value?: string, ignore?: boolean) {
  if (!value || ignore) return value;

  try {
    // Check if value looks like a file path
    if (
      value.startsWith('/') ||
      value.startsWith('./') ||
      value.startsWith('../')
    ) {
      // Resolve the path (handle relative paths)
      const resolvedPath = path.resolve(value);

      // Check if file exists
      if (fs.existsSync(resolvedPath)) {
        // File exists, read and return its contents
        return fs.readFileSync(resolvedPath, 'utf8').trim();
      }
    }

    // If not a file path or file doesn't exist, return value as is
    return value;
  } catch (error: any) {
    console.log(`Error reading file at ${value}: ${error.message}`);
    // Return the original value if there's an error
    return value;
  }
}

const nodeEnv = {
  NODE_ENV: getValueOrFileContents(process.env.NODE_ENV, true),
  PORT: getValueOrFileContents(process.env.PORT) || 8787,

  TLS_KEY_PATH: getValueOrFileContents(process.env.TLS_KEY_PATH, true),
  TLS_CERT_PATH: getValueOrFileContents(process.env.TLS_CERT_PATH, true),
  TLS_CA_PATH: getValueOrFileContents(process.env.TLS_CA_PATH, true),

  AWS_ACCESS_KEY_ID: getValueOrFileContents(process.env.AWS_ACCESS_KEY_ID),
  AWS_SECRET_ACCESS_KEY: getValueOrFileContents(
    process.env.AWS_SECRET_ACCESS_KEY
  ),
  AWS_SESSION_TOKEN: getValueOrFileContents(process.env.AWS_SESSION_TOKEN),
  AWS_ROLE_ARN: getValueOrFileContents(process.env.AWS_ROLE_ARN),
  AWS_PROFILE: getValueOrFileContents(process.env.AWS_PROFILE, true),
  AWS_WEB_IDENTITY_TOKEN_FILE: getValueOrFileContents(
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE,
    true
  ),
  AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: getValueOrFileContents(
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI,
    true
  ),
  AWS_ASSUME_ROLE_ACCESS_KEY_ID: getValueOrFileContents(
    process.env.AWS_ASSUME_ROLE_ACCESS_KEY_ID
  ),
  AWS_ASSUME_ROLE_SECRET_ACCESS_KEY: getValueOrFileContents(
    process.env.AWS_ASSUME_ROLE_SECRET_ACCESS_KEY
  ),
  AWS_ASSUME_ROLE_REGION: getValueOrFileContents(
    process.env.AWS_ASSUME_ROLE_REGION
  ),
  AWS_REGION: getValueOrFileContents(process.env.AWS_REGION),
  AWS_ENDPOINT_DOMAIN: getValueOrFileContents(process.env.AWS_ENDPOINT_DOMAIN),
  AWS_IMDS_V1: getValueOrFileContents(process.env.AWS_IMDS_V1),

  AZURE_AUTH_MODE: getValueOrFileContents(process.env.AZURE_AUTH_MODE),
  AZURE_ENTRA_CLIENT_ID: getValueOrFileContents(
    process.env.AZURE_ENTRA_CLIENT_ID
  ),
  AZURE_ENTRA_CLIENT_SECRET: getValueOrFileContents(
    process.env.AZURE_ENTRA_CLIENT_SECRET
  ),
  AZURE_ENTRA_TENANT_ID: getValueOrFileContents(
    process.env.AZURE_ENTRA_TENANT_ID
  ),
  AZURE_MANAGED_CLIENT_ID: getValueOrFileContents(
    process.env.AZURE_MANAGED_CLIENT_ID
  ),
  AZURE_MANAGED_VERSION: getValueOrFileContents(
    process.env.AZURE_MANAGED_VERSION
  ),
  AZURE_IDENTITY_ENDPOINT: getValueOrFileContents(
    process.env.IDENTITY_ENDPOINT,
    true
  ),
  AZURE_MANAGED_IDENTITY_HEADER: getValueOrFileContents(
    process.env.IDENTITY_HEADER
  ),
  AZURE_AUTHORITY_HOST: getValueOrFileContents(
    process.env.AZURE_AUTHORITY_HOST
  ),
  AZURE_TENANT_ID: getValueOrFileContents(process.env.AZURE_TENANT_ID),
  AZURE_CLIENT_ID: getValueOrFileContents(process.env.AZURE_CLIENT_ID),
  AZURE_FEDERATED_TOKEN_FILE: getValueOrFileContents(
    process.env.AZURE_FEDERATED_TOKEN_FILE
  ),

  SSE_ENCRYPTION_TYPE: getValueOrFileContents(process.env.SSE_ENCRYPTION_TYPE),
  KMS_KEY_ID: getValueOrFileContents(process.env.KMS_KEY_ID),
  KMS_BUCKET_KEY_ENABLED: getValueOrFileContents(
    process.env.KMS_BUCKET_KEY_ENABLED
  ),
  KMS_ENCRYPTION_CONTEXT: getValueOrFileContents(
    process.env.KMS_ENCRYPTION_CONTEXT
  ),
  KMS_ENCRYPTION_ALGORITHM: getValueOrFileContents(
    process.env.KMS_ENCRYPTION_ALGORITHM
  ),
  KMS_ENCRYPTION_CUSTOMER_KEY: getValueOrFileContents(
    process.env.KMS_ENCRYPTION_CUSTOMER_KEY
  ),
  KMS_ENCRYPTION_CUSTOMER_KEY_MD5: getValueOrFileContents(
    process.env.KMS_ENCRYPTION_CUSTOMER_KEY_MD5
  ),
  KMS_ROLE_ARN: getValueOrFileContents(process.env.KMS_ROLE_ARN),

  HTTP_PROXY: getValueOrFileContents(process.env.HTTP_PROXY),
  HTTPS_PROXY: getValueOrFileContents(process.env.HTTPS_PROXY),

  APM_LOGGER: getValueOrFileContents(process.env.APM_LOGGER),

  TRUSTED_CUSTOM_HOSTS: getValueOrFileContents(
    process.env.TRUSTED_CUSTOM_HOSTS
  ),
};

export const Environment = (c?: Context) => {
  if (isNodeInstance) {
    return nodeEnv;
  }
  if (c) {
    return env(c);
  }
  return {};
};
