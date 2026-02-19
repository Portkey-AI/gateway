import { version } from '../../../../package.json';
import { Environment } from '../../../utils/env';
export const ANALYTICS_STORES = {
  CLICKHOUSE: 'clickhouse',
  CONTROL_PLANE: 'control_plane',
};
export const LOG_STORES = {
  CONTROL_PLANE: 'control_plane',
  MONGO: 'mongo',
  S3: 's3',
  S3_CUSTOM: 's3_custom',
  S3_ASSUME: 's3_assume',
  WASABI: 'wasabi',
  GOOGLE_CLOUD_STORAGE: 'gcs',
  GOOGLE_CLOUD_STORAGE_ASSUME: 'gcs_assume',
  AZURE_STORAGE: 'azure',
  NETAPP: 'netapp',
};

export const SENSITIVE_CONFIG_FIELDS = [
  'api_key',
  'apiKey',
  // Bedrock
  'aws_external_id',
  'aws_role_arn',
  'aws_access_key_id',
  'aws_secret_access_key',
  // Vertex
  'vertex_service_account_json',
];

export const FETCH_MODEL_PRICING_CONFIG_BASEPATH = `${Environment({}).CONFIG_READER_PATH}/pricing`;
export const MODEL_CONFIG_CACHE_TTL = 6 * 60 * 60; // 6 hours
export const NO_PRICING_CONFIG_CACHE_TTL = 60 * 60; // 1 hour
export const MODEL_CONFIG_MEM_CACHE_TTL = 5 * 60; // 5 minutes
export const MODEL_CONFIG_CACHE_PREFIX = `MODEL_PRICING_CONFIG_${version.replaceAll('.', '_')}`;
export const HOOKS_CREDENTIALS_SENSITIVE_FIELDS = [
  'api_key',
  'apiKey',
  'awsAccessKeyId',
  'awsSecretAccessKey',
  'awsRoleArn',
  'awsExternalId',
  'clientSecret',
  'AIRS_API_KEY',
];

export const UNIFIED_FORM_DATA_ROUTES = [
  'createTranscription',
  'createTranslation',
  'imageEdit',
];
