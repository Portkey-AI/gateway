import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import fs from 'fs/promises';
import path from 'path';
import { BedrockResponse, PIIFilter, BedrockBody } from './type';
import { post, getCacheUtils } from '../utils';
import { Environment } from '../../src/utils/env';
import { getRuntimeKey } from 'hono/adapter';
import { getContext } from 'hono/context-storage';
import { PluginOptions } from '../types';
import { logger } from '../../src/apm';

const runtime = getRuntimeKey();

const getRuntimeContext = () => {
  const defaultContext = { env: {} as Record<string, any> };
  return runtime === 'workerd'
    ? getContext<Record<string, any>>()
    : defaultContext;
};

export const getAwsEndpointDomain = () => {
  return (
    Environment(getRuntimeContext()?.env).AWS_ENDPOINT_DOMAIN || 'amazonaws.com'
  );
};
// Define a proper credentials type
interface AWSCredentials {
  source: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  awsRoleArn?: string;
  awsRegion?: string;
}

// Update the cache variable types
let AWS_SHARED_CREDENTIALS: { credentials?: AWSCredentials };
let AWS_CONFIG_CREDENTIALS: { credentials?: AWSCredentials };

function getAwsFilePath(fileName: string, options?: PluginOptions) {
  return Environment(options?.env).HOME || Environment(options?.env).USERPROFILE
    ? path.join(
        (Environment(options?.env).HOME ||
          Environment(options?.env).USERPROFILE) as string,
        '.aws',
        fileName
      )
    : '';
}

async function parseIniFile(filePath: string) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const result: Record<string, any> = {};
  let currentSection: string | null = null;

  lines.forEach((line) => {
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      result[currentSection] = {};
    } else if (currentSection && line.includes('=')) {
      const [key, value] = line.split('=').map((s) => s.trim());
      result[currentSection][key] = value;
    }
  });
  return result;
}

export function getRegionFromEnv(options?: PluginOptions): string {
  return (
    Environment(options?.env).AWS_REGION ||
    Environment(options?.env).AWS_DEFAULT_REGION
  );
}

export const generateAWSHeaders = async (
  body: Record<string, any> | undefined,
  headers: Record<string, string>,
  url: string,
  method: string,
  awsService: string,
  awsRegion: string,
  awsAccessKeyID: string,
  awsSecretAccessKey: string,
  awsSessionToken: string | undefined
): Promise<Record<string, string>> => {
  const signer = new SignatureV4({
    service: awsService,
    region: awsRegion || 'us-east-1',
    credentials: {
      accessKeyId: awsAccessKeyID,
      secretAccessKey: awsSecretAccessKey,
      ...(awsSessionToken && { sessionToken: awsSessionToken }),
    },
    sha256: Sha256,
  });

  const urlObj = new URL(url);
  const hostname = urlObj.hostname;
  headers['host'] = hostname;
  let requestBody;
  if (method !== 'GET' && body) {
    requestBody = JSON.stringify(body);
  }
  const queryParams = Object.fromEntries(urlObj.searchParams.entries());
  const request = {
    method: method,
    path: urlObj.pathname,
    protocol: 'https',
    query: queryParams,
    hostname: urlObj.hostname,
    headers: headers,
    ...(requestBody && { body: requestBody }),
  };

  const signed = await signer.sign(request);
  return signed.headers;
};

function getCredentialsFromEnvironment(
  options?: PluginOptions
): AWSCredentials | undefined {
  if (
    Environment(options?.env).AWS_ACCESS_KEY_ID &&
    Environment(options?.env).AWS_SECRET_ACCESS_KEY
  ) {
    return {
      source: 'Environment Variables',
      accessKeyId: Environment(options?.env).AWS_ACCESS_KEY_ID,
      secretAccessKey: Environment(options?.env).AWS_SECRET_ACCESS_KEY,
      sessionToken: Environment(options?.env).AWS_SESSION_TOKEN,
      awsRoleArn: Environment(options?.env).AWS_ROLE_ARN,
      awsRegion: getRegionFromEnv(options) || 'us-east-1',
    };
  }
}

async function getCredentialsFromSharedCredentialsFile(
  options?: PluginOptions
): Promise<AWSCredentials | undefined> {
  if (AWS_SHARED_CREDENTIALS) {
    return AWS_SHARED_CREDENTIALS.credentials;
  }
  try {
    const credentials = await parseIniFile(getAwsFilePath('credentials'));
    const profile = Environment(options?.env).AWS_PROFILE || 'default';

    if (credentials[profile]) {
      const {
        aws_access_key_id: accessKeyId,
        aws_secret_access_key: secretAccessKey,
        aws_session_token: sessionToken,
        aws_role_arn: awsRoleArn,
        region,
        aws_region,
      } = credentials[profile];

      // Validate required credentials
      if (!accessKeyId || !secretAccessKey) {
        AWS_SHARED_CREDENTIALS = {};
        return;
      }

      const awsCredentials: AWSCredentials = {
        source: `Shared Credentials File (${profile})`,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        awsRoleArn: awsRoleArn || Environment(options?.env).AWS_ROLE_ARN,
        awsRegion:
          region || aws_region || getRegionFromEnv(options) || 'us-east-1',
      };

      AWS_SHARED_CREDENTIALS = { credentials: awsCredentials };
      return awsCredentials;
    }
    AWS_SHARED_CREDENTIALS = {};
    return;
  } catch (error) {
    AWS_SHARED_CREDENTIALS = {};
    return;
  }
}

async function getCredentialsFromAwsConfigFile(
  options?: PluginOptions
): Promise<AWSCredentials | undefined> {
  if (AWS_CONFIG_CREDENTIALS) {
    return AWS_CONFIG_CREDENTIALS.credentials;
  }

  try {
    const config = await parseIniFile(getAwsFilePath('config'));
    const profileName = Environment(options?.env).AWS_PROFILE || 'default';
    const profile =
      profileName === 'default' ? 'default' : `profile ${profileName}`;

    if (config[profile]) {
      const {
        aws_access_key_id: accessKeyId,
        aws_secret_access_key: secretAccessKey,
        aws_session_token: sessionToken,
        role_arn: awsRoleArn,
        region,
        aws_region,
      } = config[profile];

      // Validate required credentials
      if (!accessKeyId || !secretAccessKey) {
        AWS_CONFIG_CREDENTIALS = {};
        return;
      }

      const awsCredentials: AWSCredentials = {
        source: `Config File (${profileName})`,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        awsRoleArn: awsRoleArn || Environment(options?.env).AWS_ROLE_ARN,
        awsRegion:
          region || aws_region || getRegionFromEnv(options) || 'us-east-1',
      };

      AWS_CONFIG_CREDENTIALS = { credentials: awsCredentials };
      return awsCredentials;
    }
    AWS_CONFIG_CREDENTIALS = {};
    return;
  } catch (error) {
    AWS_CONFIG_CREDENTIALS = {};
    return;
  }
}

async function assumeRoleWithWebIdentity(
  token: string,
  roleArn: string,
  awsRegion?: string,
  options?: PluginOptions
) {
  const params = new URLSearchParams({
    Version: '2011-06-15',
    Action: 'AssumeRoleWithWebIdentity',
    RoleArn: roleArn,
    RoleSessionName: `eks-${Date.now()}`,
    WebIdentityToken: token,
  });

  const region =
    awsRegion || Environment(options?.env).AWS_REGION || 'us-east-1';
  const response = await fetch(
    `https://sts.${region}.${getAwsEndpointDomain()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const errorMessage = await response.text();
    logger.error({ message: `STS error ${errorMessage}` });
    throw new Error(`STS request failed: ${response.status}`);
  }

  const data = await response.text();
  // Assuming parseSTSResponse is still available
  return parseXml(data);
}

async function assumeRoleWithPodIdentity(
  token: string,
  credentialFullUri: string
) {
  const response = await fetch(credentialFullUri, {
    method: 'GET',
    headers: {
      Authorization: token,
    },
  });

  if (!response.ok) {
    throw new Error(`Pod Identity request failed: ${response.status}`);
  }

  const data: any = await response.json();
  return {
    accessKeyId: data.AccessKeyId,
    secretAccessKey: data.SecretAccessKey,
    sessionToken: data.Token,
    expiration: data.Expiration,
  };
}

async function getAssumedWebIdentityCredentials(
  awsRegion?: string,
  options?: PluginOptions
) {
  const { getFromKV, putInKV } = getCacheUtils(options);
  if (
    Environment(options?.env).AWS_WEB_IDENTITY_TOKEN_FILE &&
    Environment(options?.env).AWS_ROLE_ARN
  ) {
    try {
      const effectiveRegion =
        awsRegion || getRegionFromEnv(options) || 'us-east-1';
      const roleArn = Environment(options?.env).AWS_ROLE_ARN;
      const cacheKey = `assumed-web-identity-${Environment(options?.env).AWS_WEB_IDENTITY_TOKEN_FILE}-role-${roleArn}-region-${effectiveRegion}`;
      const resp = await getFromKV(cacheKey);
      if (resp) {
        return resp;
      }
      const token = await fs.readFile(
        Environment(options?.env).AWS_WEB_IDENTITY_TOKEN_FILE,
        'utf8'
      );
      const credentials = await assumeRoleWithWebIdentity(
        token,
        roleArn,
        effectiveRegion,
        options
      );
      if (credentials) {
        const merged = {
          ...credentials,
          awsRoleArn: Environment(options?.env).AWS_ROLE_ARN,
          awsRegion: effectiveRegion,
        };
        await putInKV(cacheKey, merged, 300); //5 minutes
        return merged;
      }
    } catch (error) {
      logger.error({
        message: `Error from getAssumedWebIdentityCredentials: ${error}`,
      });
    }
  }
  return null;
}

async function getPodIdentityCredentials(
  awsRegion?: string,
  options?: PluginOptions
) {
  const { getFromKV, putInKV } = getCacheUtils(options);
  if (
    Environment(options?.env).AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE &&
    Environment(options?.env).AWS_CONTAINER_CREDENTIALS_FULL_URI
  ) {
    try {
      const effectiveRegion =
        awsRegion || getRegionFromEnv(options) || 'us-east-1';
      const credentialFullUri = Environment(
        options?.env
      ).AWS_CONTAINER_CREDENTIALS_FULL_URI;
      const cacheKey = `assumed-pod-identity-${Environment(options?.env).AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE}-region-${effectiveRegion}`;
      const resp = await getFromKV(cacheKey);
      if (resp) {
        return resp;
      }

      const token = await fs.readFile(
        Environment(options?.env).AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE,
        'utf8'
      );

      const credentials = await assumeRoleWithPodIdentity(
        token.trim(),
        credentialFullUri
      );

      if (credentials) {
        const result = {
          source: 'EKS Pod Identity',
          ...credentials,
          awsRegion: effectiveRegion,
        };

        await putInKV(cacheKey, result, 300);
        return result;
      }
    } catch (error) {
      logger.error('Failed to get Pod Identity credentials:', error);
      return null;
    }
  }
  return null;
}

async function getIRSACredentials(awsRegion?: string, options?: PluginOptions) {
  // get from web identity
  return getAssumedWebIdentityCredentials(awsRegion, options);
}

async function getCredentialsFromECSContainer(options?: PluginOptions) {
  const { getFromKV, putInKV } = getCacheUtils(options);
  if (Environment(options?.env).AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
    const cacheKey = `assumed-ecs-container-credentials`;
    const resp = await getFromKV(cacheKey);
    if (resp) {
      return resp;
    }
    const ecsUri = `http://169.254.170.2${Environment(options?.env).AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`;
    const response = await fetch(ecsUri, {
      method: 'GET',
    });
    if (!response.ok) {
      const error = await response.text();
      logger.error({ message: `Failed to get FromECSContainer: ${error}` });
      return;
    }
    const credentials: any = await response.json();

    const derivedRegion =
      getRegionFromEnv(options) ||
      (await getECSRegionFromMetadata(options)) ||
      'us-east-1';

    const derivedRoleArn =
      credentials.RoleArn ||
      Environment(options?.env).AWS_ROLE_ARN ||
      (await getECSTaskRoleArnFromMetadata());

    await putInKV(
      cacheKey,
      {
        source: 'ECS Container Credentials',
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.Token,
        expiration: credentials.Expiration,
        awsRoleArn: derivedRoleArn,
        awsRegion: derivedRegion,
      },
      300
    ); //5 minutes
    return {
      source: 'ECS Container Credentials',
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.Token,
      expiration: credentials.Expiration,
      awsRoleArn: derivedRoleArn,
      awsRegion: derivedRegion,
    };
  }
}

async function getIMDSv2Token() {
  const response = await fetch(`http://169.254.169.254/latest/api/token`, {
    method: 'PUT',
    headers: {
      'X-aws-ec2-metadata-token-ttl-seconds': '21600',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ message: `Failed to get IMDSv2 token: ${error}` });
    throw new Error(error);
  }
  const imdsv2Token = await response.text();
  return imdsv2Token;
}

async function getIMDSRegion(
  token?: string,
  options?: PluginOptions
): Promise<string> {
  const response = await fetch(
    'http://169.254.169.254/latest/dynamic/instance-identity/document',
    {
      ...(token && {
        method: 'GET',
        headers: { 'X-aws-ec2-metadata-token': token },
      }),
    }
  );
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Failed to get IMDS region: ${txt}`);
  }
  const doc: any = await response.json();
  return doc.region || getRegionFromEnv(options);
}

async function getRoleName(token?: string) {
  const response = await fetch(
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    {
      ...(token && {
        method: 'GET',
        headers: {
          'X-aws-ec2-metadata-token': token,
        },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to get role name: ${response.status}`);
  }
  return response.text();
}

async function getIMDSRoleCredentials(awsRoleArn?: string, token?: string) {
  const response = await fetch(
    `http://169.254.169.254/latest/meta-data/iam/security-credentials/${awsRoleArn}`,
    {
      ...(token && {
        method: 'GET',
        headers: {
          'X-aws-ec2-metadata-token': token,
        },
      }),
    }
  );
  if (!response.ok) {
    const error = await response.text();
    logger.error({ message: `Failed to get credentials: ${error}` });
    throw new Error(error);
  }

  const credentials: any = await response.json();
  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.Token,
    expiration: credentials.Expiration,
    awsRoleArn: awsRoleArn,
  };
}

// Try to derive region from ECS task metadata (preferred) or AZ suffix fallback
async function getECSRegionFromMetadata(
  options?: PluginOptions
): Promise<string | null> {
  const uri =
    Environment(options?.env).ECS_CONTAINER_METADATA_URI_V4 ||
    Environment(options?.env).ECS_CONTAINER_METADATA_URI;
  if (!uri) return null;

  try {
    const resp = await fetch(`${uri}/task`, { method: 'GET' });
    if (!resp.ok) return null;
    const meta: any = await resp.json();

    // arn:aws:ecs:us-west-2:123456789012:task/cluster/xxxxxxxx
    if (meta?.TaskARN && typeof meta.TaskARN === 'string') {
      const m = meta.TaskARN.match(
        /^arn:(aws|aws-cn|aws-us-gov):ecs:([a-z0-9-]+):/
      );
      if (m?.[2]) return m[2];
    }

    // AvailabilityZone: "us-west-2b" -> "us-west-2"
    if (meta?.AvailabilityZone && typeof meta.AvailabilityZone === 'string') {
      return meta.AvailabilityZone.replace(/[a-z]$/i, '');
    }
  } catch {
    // ignore and fall back
  }
  return null;
}

// Add near other IMDS helpers
async function getIMDSIdentityDocument(token?: string): Promise<any | null> {
  try {
    const resp = await fetch(
      'http://169.254.169.254/latest/dynamic/instance-identity/document',
      {
        ...(token && {
          method: 'GET',
          headers: { 'X-aws-ec2-metadata-token': token },
        }),
      }
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function inferPartitionFromRegion(region?: string): string {
  if (!region) return 'aws';
  if (region.startsWith('cn-')) return 'aws-cn';
  if (region.startsWith('us-gov-')) return 'aws-us-gov';
  return 'aws';
}

async function getIMDSRoleArn(token?: string): Promise<string | undefined> {
  try {
    const roleName = await getRoleName(token); // existing helper, returns role name
    const doc = await getIMDSIdentityDocument(token);
    const accountId = doc?.accountId;
    const region = doc?.region;
    const partition = inferPartitionFromRegion(region);
    if (roleName && accountId) {
      return `arn:${partition}:iam::${accountId}:role/${roleName}`;
    }
  } catch {
    // ignore
  }
  // Fallback: try instance profile arn and convert to role arn (best-effort)
  try {
    const resp = await fetch(
      'http://169.254.169.254/latest/meta-data/iam/info',
      {
        ...(token && {
          method: 'GET',
          headers: { 'X-aws-ec2-metadata-token': token },
        }),
      }
    );
    if (resp.ok) {
      const info: any = await resp.json();
      const ipa = info?.InstanceProfileArn; // arn:...:instance-profile/NAME
      if (ipa && typeof ipa === 'string') {
        return ipa.replace(':instance-profile/', ':role/');
      }
    }
  } catch {
    // ignore
  }
}

// Add near other ECS helpers
async function getECSTaskRoleArnFromMetadata(
  options?: PluginOptions
): Promise<string | null> {
  const uri =
    Environment(options?.env).ECS_CONTAINER_METADATA_URI_V4 ||
    Environment(options?.env).ECS_CONTAINER_METADATA_URI;
  if (!uri) return null;

  try {
    const resp = await fetch(`${uri}/task`, { method: 'GET' });
    if (!resp.ok) return null;
    const meta: any = await resp.json();
    // Common fields depending on agent version
    if (meta?.TaskRoleArn) return meta.TaskRoleArn;
    if (meta?.ExecutionRoleArn) return meta.ExecutionRoleArn;
  } catch {
    // ignore
  }
  return null;
}

async function getIMDSAssumedCredentials(options?: PluginOptions) {
  const { getFromKV, putInKV } = getCacheUtils(options);
  const cacheKey = `assumed-imds-credentials`;
  const resp = await getFromKV(cacheKey);
  if (resp) {
    return resp;
  }
  let imdsv2Token;
  //use v2 by default
  if (!Environment(options?.env).AWS_IMDS_V1) {
    // get token
    imdsv2Token = await getIMDSv2Token();
  }
  // get role name for IMDS credentials, and role ARN for metadata
  const roleName = await getRoleName(imdsv2Token);
  const baseCreds = await getIMDSRoleCredentials(roleName, imdsv2Token);
  const roleArn = await getIMDSRoleArn(imdsv2Token);
  // get region
  let region = getRegionFromEnv(options);
  if (!region) {
    try {
      region = (await getIMDSRegion(imdsv2Token, options)) || 'us-east-1';
    } catch (e) {
      // fall back to env/default if IMDS region fails
      region = 'us-east-1';
    }
  }

  const credentials = {
    ...baseCreds,
    awsRegion: region,
    ...(roleArn && { awsRoleArn: roleArn }),
  };
  await putInKV(cacheKey, credentials, 300); //5 minutes
  return credentials;
}

async function getSTSAssumedCredentials(
  awsRoleArn: string,
  awsExternalId?: string,
  awsRegion?: string,
  accessKey?: string,
  secretKey?: string,
  sessionToken?: string,
  options?: PluginOptions
) {
  const { getFromKV, putInKV } = getCacheUtils(options);
  const cacheKey = `assumed-sts-${awsRoleArn}/${awsExternalId}/${awsRegion}`;
  const resp = await getFromKV(cacheKey);
  if (resp) {
    return resp;
  }
  // Long-term credentials to assume role, static values from ENV
  const accessKeyId: string =
    accessKey || Environment(options?.env).AWS_ASSUME_ROLE_ACCESS_KEY_ID || '';
  const secretAccessKey: string =
    secretKey ||
    Environment(options?.env).AWS_ASSUME_ROLE_SECRET_ACCESS_KEY ||
    '';
  const region =
    awsRegion ||
    Environment(options?.env).AWS_ASSUME_ROLE_REGION ||
    getRegionFromEnv(options) ||
    'us-east-1';
  const service = 'sts';
  const hostname = `sts.${region}.${getAwsEndpointDomain()}`;
  const signer = new SignatureV4({
    service,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    },
    sha256: Sha256,
  });
  const date = new Date();
  const sessionName = `${date.getFullYear()}${date.getMonth()}${date.getDay()}`;
  const url = `https://${hostname}?Action=AssumeRole&Version=2011-06-15&RoleArn=${awsRoleArn}&RoleSessionName=${sessionName}${awsExternalId ? `&ExternalId=${awsExternalId}` : ''}`;
  const urlObj = new URL(url);
  const requestHeaders = { host: hostname };
  const signOptions = {
    method: 'GET',
    path: urlObj.pathname,
    protocol: urlObj.protocol,
    hostname: urlObj.hostname,
    headers: requestHeaders,
    query: Object.fromEntries(urlObj.searchParams),
  };
  const { headers } = await signer.sign(signOptions);

  let credentials: any;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      const resp = await response.text();
      logger.error({ message: resp });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlData = await response.text();
    const parsed = parseXml(xmlData);
    credentials = { ...parsed, awsRegion: region, awsRoleArn };
    await putInKV(cacheKey, credentials, 300); //5 minutes
  } catch (error) {
    // logger.error({ message: `Error assuming role:, ${error}` });
    return credentials;
  }
  return credentials;
}

export async function getAssumedRoleCredentials(
  awsRoleArn?: string,
  awsExternalId?: string,
  awsRegion?: string,
  creds?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  },
  options?: PluginOptions
) {
  let accessKeyId =
    creds?.accessKeyId ||
    Environment(options?.env).AWS_ASSUME_ROLE_ACCESS_KEY_ID;
  let secretAccessKey =
    creds?.secretAccessKey ||
    Environment(options?.env).AWS_ASSUME_ROLE_SECRET_ACCESS_KEY;
  let sessionToken = creds?.sessionToken;

  // except assumed role others are only supported in node runtime
  if (runtime === 'node') {
    if (!accessKeyId && !secretAccessKey) {
      // check Environment first
      let credentials = getCredentialsFromEnvironment(options);
      if (!credentials) {
        credentials = await getCredentialsFromSharedCredentialsFile(options);
      }
      if (!credentials) {
        credentials = await getCredentialsFromAwsConfigFile(options);
      }

      if (!credentials) {
        try {
          credentials = await getIRSACredentials(awsRegion, options);
        } catch (error) {
          logger.error(error);
        }
      }

      if (!credentials) {
        try {
          credentials = await getPodIdentityCredentials(awsRegion);
        } catch (error) {
          logger.log(error);
        }
      }

      if (!credentials) {
        try {
          credentials = await getCredentialsFromECSContainer(options);
        } catch (error) {
          logger.error(error);
        }
      }

      if (!credentials) {
        try {
          credentials = await getIMDSAssumedCredentials(options);
        } catch (error) {
          logger.error(error);
        }
      }
      if (!awsRoleArn || credentials?.awsRoleArn === awsRoleArn) {
        return credentials;
      }
      accessKeyId = credentials?.accessKeyId;
      secretAccessKey = credentials?.secretAccessKey;
      sessionToken = credentials?.sessionToken;
    }
  }

  if (!awsRoleArn) {
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      awsRegion,
      awsRoleArn,
    };
  }

  return getSTSAssumedCredentials(
    awsRoleArn,
    awsExternalId,
    awsRegion,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    options
  );
}

function parseXml(xml: string) {
  // Simple XML parser for this specific use case
  const getTagContent = (tag: string) => {
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
    const match = xml.match(regex);
    return match ? match[1] : null;
  };

  const credentials = getTagContent('Credentials');
  if (!credentials) {
    throw new Error('Failed to parse Credentials from XML response');
  }

  return {
    accessKeyId: getTagContent('AccessKeyId'),
    secretAccessKey: getTagContent('SecretAccessKey'),
    sessionToken: getTagContent('SessionToken'),
    expiration: getTagContent('Expiration'),
  };
}

if (runtime === 'node') {
  await getCredentialsFromSharedCredentialsFile(getRuntimeContext()?.env);
  await getCredentialsFromAwsConfigFile(getRuntimeContext()?.env);
}

export const bedrockPost = async (
  credentials: Record<string, string>,
  body: BedrockBody,
  timeout?: number
) => {
  const url = `https://bedrock-runtime.${credentials?.awsRegion}.${getAwsEndpointDomain()}/guardrail/${credentials?.guardrailId}/version/${credentials?.guardrailVersion}/apply`;

  const headers = await generateAWSHeaders(
    body,
    {
      'Content-Type': 'application/json',
    },
    url,
    'POST',
    'bedrock',
    credentials.awsRegion,
    credentials.awsAccessKeyId,
    credentials.awsSecretAccessKey,
    credentials.awsSessionToken || ''
  );

  return await post<BedrockResponse>(
    url,
    body,
    {
      headers,
      method: 'POST',
    },
    timeout
  );
};

const replaceMatches = (
  filter: PIIFilter & { name?: string },
  text: string,
  isRegex?: boolean
) => {
  // `filter.type` will be for PII, else use name to `mask` text.
  return text.replaceAll(
    filter.match,
    `{${isRegex ? filter.name : filter.type}}`
  );
};

/**
 * @description Redacts PII information for the text passed by invoking the bedrock endpoint.
 * @param text
 * @param eventType
 * @param credentials
 * @returns
 */
export const redactPii = (text: string, result: BedrockResponse | null) => {
  try {
    if (!result) return null;
    if (!result.assessments[0]?.sensitiveInformationPolicy || !text) {
      return null;
    }
    // `ANONYMIZED` means text is already masked by api invokation
    const isMasked =
      result.assessments[0].sensitiveInformationPolicy.piiEntities?.find(
        (entity) => entity.action === 'ANONYMIZED'
      );

    let maskedText: string = text;
    if (isMasked) {
      // Use the invoked text directly.
      const data = result.output?.[0];

      maskedText = data?.text;
    } else {
      // Replace the all entires of each filter sent from api.
      result.assessments[0].sensitiveInformationPolicy.piiEntities?.forEach(
        (filter) => {
          maskedText = replaceMatches(filter, maskedText, false);
        }
      );
    }

    // Replace the all entires of each filter sent from api for regex
    const isRegexMatch =
      result.assessments[0].sensitiveInformationPolicy?.regexes?.length > 0;
    if (isRegexMatch) {
      result.assessments[0].sensitiveInformationPolicy.regexes.forEach(
        (regex) => {
          maskedText = replaceMatches(regex as any, maskedText, true);
        }
      );
    }
    return maskedText;
  } catch (e) {
    return null;
  }
};
