import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../apm';
import { externalServiceFetch } from './fetch';
import { Environment } from './env';

export const awsEndpointDomain =
  Environment({}).AWS_ENDPOINT_DOMAIN || 'amazonaws.com';

export interface AWSCredentials {
  source?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: string;
  awsRoleArn?: string;
  awsRegion?: string;
}

// In-memory cache for file-based credentials (no Redis dependency)
let AWS_SHARED_CREDENTIALS: { credentials?: AWSCredentials };
let AWS_CONFIG_CREDENTIALS: { credentials?: AWSCredentials };

function getAwsFilePath(fileName: string, env?: Record<string, any>) {
  return Environment(env).HOME || Environment(env).USERPROFILE
    ? path.join(
        (Environment(env).HOME || Environment(env).USERPROFILE) as string,
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

export function getRegionFromEnv(env?: Record<string, any>): string {
  return Environment(env).AWS_REGION || Environment(env).AWS_DEFAULT_REGION;
}

export const generateAWSHeaders = async (
  body: Record<string, any> | string | undefined,
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
  headers['host'] = urlObj.host;
  const protocol = urlObj.protocol?.replace(':', '')?.toLowerCase();
  let requestBody;
  if (!body) {
    requestBody = null;
  } else if (
    body instanceof Uint8Array ||
    body instanceof Buffer ||
    body instanceof ArrayBuffer ||
    typeof body === 'string'
  ) {
    requestBody = body;
  } else if (body && typeof body === 'object' && method !== 'GET') {
    requestBody = JSON.stringify(body);
  }
  const queryParams = Object.fromEntries(urlObj.searchParams.entries());
  const request = {
    method: method,
    path: urlObj.pathname,
    protocol: protocol || 'https',
    query: queryParams,
    hostname: urlObj.hostname,
    headers: headers,
    ...(requestBody && { body: requestBody }),
  };

  const unsignableHeaders = [];

  if (body instanceof ArrayBuffer) {
    unsignableHeaders.push('x-amz-content-sha256');
    request.headers['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';
  }

  const signed = await signer.sign(request, {
    unsignableHeaders: new Set(unsignableHeaders),
  });

  return signed.headers;
};

export function getCredentialsFromEnvironment(
  env?: Record<string, any>
): AWSCredentials | undefined {
  if (
    Environment(env).AWS_ACCESS_KEY_ID &&
    Environment(env).AWS_SECRET_ACCESS_KEY
  ) {
    return {
      source: 'Environment Variables',
      accessKeyId: Environment(env).AWS_ACCESS_KEY_ID,
      secretAccessKey: Environment(env).AWS_SECRET_ACCESS_KEY,
      sessionToken: Environment(env).AWS_SESSION_TOKEN,
      awsRoleArn: Environment(env).AWS_ROLE_ARN,
      awsRegion: getRegionFromEnv(env) || 'us-east-1',
    };
  }
}

export async function getCredentialsFromSharedCredentialsFile(
  env?: Record<string, any>
): Promise<AWSCredentials | undefined> {
  if (AWS_SHARED_CREDENTIALS) {
    return AWS_SHARED_CREDENTIALS.credentials;
  }
  try {
    const credentials = await parseIniFile(getAwsFilePath('credentials'));
    const profile = Environment(env).AWS_PROFILE || 'default';

    if (credentials[profile]) {
      const {
        aws_access_key_id: accessKeyId,
        aws_secret_access_key: secretAccessKey,
        aws_session_token: sessionToken,
        aws_role_arn: awsRoleArn,
        region,
        aws_region,
      } = credentials[profile];

      if (!accessKeyId || !secretAccessKey) {
        AWS_SHARED_CREDENTIALS = {};
        return;
      }

      const awsCredentials: AWSCredentials = {
        source: `Shared Credentials File (${profile})`,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        awsRoleArn: awsRoleArn || Environment(env).AWS_ROLE_ARN,
        awsRegion: region || aws_region || getRegionFromEnv(env) || 'us-east-1',
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

export async function getCredentialsFromAwsConfigFile(
  env?: Record<string, any>
): Promise<AWSCredentials | undefined> {
  if (AWS_CONFIG_CREDENTIALS) {
    return AWS_CONFIG_CREDENTIALS.credentials;
  }

  try {
    const config = await parseIniFile(getAwsFilePath('config'));
    const profileName = Environment(env).AWS_PROFILE || 'default';
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

      if (!accessKeyId || !secretAccessKey) {
        AWS_CONFIG_CREDENTIALS = {};
        return;
      }

      const awsCredentials: AWSCredentials = {
        source: `Config File (${profileName})`,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        awsRoleArn: awsRoleArn || Environment(env).AWS_ROLE_ARN,
        awsRegion: region || aws_region || getRegionFromEnv(env) || 'us-east-1',
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

export function parseSTSXmlResponse(xml: string): AWSCredentials | null {
  const getTagContent = (tag: string) => {
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
    const match = xml.match(regex);
    return match ? match[1] : null;
  };

  const credentials = getTagContent('Credentials');
  if (!credentials) {
    return null;
  }

  return {
    accessKeyId: getTagContent('AccessKeyId') || '',
    secretAccessKey: getTagContent('SecretAccessKey') || '',
    sessionToken: getTagContent('SessionToken') || undefined,
    expiration: getTagContent('Expiration') || undefined,
  };
}

async function getAssumedWebIdentityCredentials(
  awsRegion?: string
): Promise<AWSCredentials | null> {
  if (
    !Environment({}).AWS_WEB_IDENTITY_TOKEN_FILE ||
    !Environment({}).AWS_ROLE_ARN
  ) {
    return null;
  }

  try {
    const effectiveRegion = awsRegion || getRegionFromEnv() || 'us-east-1';
    const roleArn = Environment({}).AWS_ROLE_ARN;

    const token = await fs.readFile(
      Environment({}).AWS_WEB_IDENTITY_TOKEN_FILE,
      'utf8'
    );

    const credentials = await fetchWebIdentityCredentials(
      token,
      roleArn,
      effectiveRegion
    );

    if (credentials) {
      const merged = {
        ...credentials,
        awsRoleArn: roleArn,
        awsRegion: effectiveRegion,
      };
      return merged;
    }
  } catch (error) {
    logger.info({
      message: `Error from getAssumedWebIdentityCredentials: ${error}`,
    });
  }
  return null;
}

export async function fetchWebIdentityCredentials(
  token: string,
  roleArn: string,
  awsRegion: string
): Promise<AWSCredentials | null> {
  const params = new URLSearchParams({
    Version: '2011-06-15',
    Action: 'AssumeRoleWithWebIdentity',
    RoleArn: roleArn,
    RoleSessionName: `eks-${Date.now()}`,
    WebIdentityToken: token,
  });

  const response = await externalServiceFetch(
    `https://sts.${awsRegion}.${awsEndpointDomain}`,
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
    logger.info({ message: `STS error ${errorMessage}` });
    return null;
  }

  const data = await response.text();
  return parseSTSXmlResponse(data);
}

export async function fetchPodIdentityCredentials(
  token: string,
  credentialFullUri: string
): Promise<AWSCredentials | null> {
  const response = await externalServiceFetch(credentialFullUri, {
    method: 'GET',
    headers: {
      Authorization: token,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data: any = await response.json();
  return {
    accessKeyId: data.AccessKeyId,
    secretAccessKey: data.SecretAccessKey,
    sessionToken: data.Token,
    expiration: data.Expiration,
  };
}

export async function fetchECSContainerCredentials(
  relativeUri: string
): Promise<AWSCredentials | null> {
  const ecsUri = `http://169.254.170.2${relativeUri}`;
  const response = await externalServiceFetch(ecsUri, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.text();
    logger.info({ message: `Failed to get FromECSContainer: ${error}` });
    return null;
  }

  const credentials: any = await response.json();
  return {
    source: 'ECS Container Credentials',
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.Token,
    expiration: credentials.Expiration,
    awsRoleArn: credentials.RoleArn,
  };
}

export async function fetchIMDSv2Token(): Promise<string> {
  const response = await externalServiceFetch(
    `http://169.254.169.254/latest/api/token`,
    {
      method: 'PUT',
      headers: {
        'X-aws-ec2-metadata-token-ttl-seconds': '21600',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    logger.info({ message: `Failed to get IMDSv2 token: ${error}` });
    throw new Error(error);
  }
  return response.text();
}

export async function fetchIMDSRegion(token?: string): Promise<string> {
  const response = await externalServiceFetch(
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
  return doc.region || getRegionFromEnv();
}

export async function fetchIMDSRoleName(token?: string): Promise<string> {
  const response = await externalServiceFetch(
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

export async function fetchIMDSCredentials(
  roleName: string,
  token?: string
): Promise<AWSCredentials | null> {
  const response = await externalServiceFetch(
    `http://169.254.169.254/latest/meta-data/iam/security-credentials/${roleName}`,
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
    logger.info({ message: `Failed to get credentials: ${error}` });
    return null;
  }

  const credentials: any = await response.json();
  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.Token,
    expiration: credentials.Expiration,
    awsRoleArn: roleName,
  };
}

export async function fetchECSRegionFromMetadata(
  env?: Record<string, any>
): Promise<string | null> {
  const uri =
    Environment(env).ECS_CONTAINER_METADATA_URI_V4 ||
    Environment(env).ECS_CONTAINER_METADATA_URI;
  if (!uri) return null;

  try {
    const resp = await externalServiceFetch(`${uri}/task`, { method: 'GET' });
    if (!resp.ok) return null;
    const meta: any = await resp.json();

    if (meta?.TaskARN && typeof meta.TaskARN === 'string') {
      const m = meta.TaskARN.match(
        /^arn:(aws|aws-cn|aws-us-gov):ecs:([a-z0-9-]+):/
      );
      if (m?.[2]) return m[2];
    }

    if (meta?.AvailabilityZone && typeof meta.AvailabilityZone === 'string') {
      return meta.AvailabilityZone.replace(/[a-z]$/i, '');
    }
  } catch {
    // ignore and fall back
  }
  return null;
}

export async function fetchIMDSIdentityDocument(
  token?: string
): Promise<any | null> {
  try {
    const resp = await externalServiceFetch(
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

export function inferPartitionFromRegion(region?: string): string {
  if (!region) return 'aws';
  if (region.startsWith('cn-')) return 'aws-cn';
  if (region.startsWith('us-gov-')) return 'aws-us-gov';
  return 'aws';
}

export async function fetchIMDSRoleArn(
  token?: string
): Promise<string | undefined> {
  try {
    const roleName = await fetchIMDSRoleName(token);
    const doc = await fetchIMDSIdentityDocument(token);
    const accountId = doc?.accountId;
    const region = doc?.region;
    const partition = inferPartitionFromRegion(region);
    if (roleName && accountId) {
      return `arn:${partition}:iam::${accountId}:role/${roleName}`;
    }
  } catch {
    // ignore
  }
  // Fallback: try instance profile arn and convert to role arn
  try {
    const resp = await externalServiceFetch(
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
      const ipa = info?.InstanceProfileArn;
      if (ipa && typeof ipa === 'string') {
        return ipa.replace(':instance-profile/', ':role/');
      }
    }
  } catch {
    // ignore
  }
}

export async function fetchECSTaskRoleArnFromMetadata(
  env?: Record<string, any>
): Promise<string | null> {
  const uri =
    Environment(env).ECS_CONTAINER_METADATA_URI_V4 ||
    Environment(env).ECS_CONTAINER_METADATA_URI;
  if (!uri) return null;

  try {
    const resp = await externalServiceFetch(`${uri}/task`, { method: 'GET' });
    if (!resp.ok) return null;
    const meta: any = await resp.json();
    if (meta?.TaskRoleArn) return meta.TaskRoleArn;
    if (meta?.ExecutionRoleArn) return meta.ExecutionRoleArn;
  } catch {
    // ignore
  }
  return null;
}

export async function fetchSTSAssumeRoleCredentials(
  awsRoleArn: string,
  awsRegion: string,
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken?: string,
  externalId?: string
): Promise<AWSCredentials | null> {
  const service = 'sts';
  const hostname = `sts.${awsRegion}.${awsEndpointDomain}`;
  const signer = new SignatureV4({
    service,
    region: awsRegion,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    },
    sha256: Sha256,
  });

  const date = new Date();
  const sessionName = `${date.getFullYear()}${date.getMonth()}${date.getDate()}`;
  const url = `https://${hostname}?Action=AssumeRole&Version=2011-06-15&RoleArn=${awsRoleArn}&RoleSessionName=${sessionName}${externalId ? `&ExternalId=${externalId}` : ''}`;
  const urlObj = new URL(url);
  const requestHeaders = { host: hostname };
  const protocol = urlObj.protocol?.replace(':', '')?.toLowerCase();

  const options = {
    method: 'GET',
    path: urlObj.pathname,
    protocol: protocol || 'https',
    hostname: urlObj.hostname,
    headers: requestHeaders,
    query: Object.fromEntries(urlObj.searchParams),
  };

  const { headers } = await signer.sign(options);

  try {
    const response = await externalServiceFetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      const resp = await response.text();
      logger.error({ message: resp });
      return null;
    }

    const xmlData = await response.text();
    return parseSTSXmlResponse(xmlData);
  } catch (error) {
    logger.error({ message: `Error assuming role: ${error}` });
    return null;
  }
}

// Composite function to get all IMDS credentials in one call (no caching)
export async function fetchIMDSAllCredentials(
  env?: Record<string, any>
): Promise<AWSCredentials | null> {
  let imdsv2Token;
  if (!Environment(env).AWS_IMDS_V1) {
    imdsv2Token = await fetchIMDSv2Token();
  }

  const roleName = await fetchIMDSRoleName(imdsv2Token);
  const baseCreds = await fetchIMDSCredentials(roleName, imdsv2Token);
  if (!baseCreds) return null;

  const roleArn = await fetchIMDSRoleArn(imdsv2Token);
  let region = getRegionFromEnv();
  if (!region) {
    try {
      region = (await fetchIMDSRegion(imdsv2Token)) || 'us-east-1';
    } catch {
      region = 'us-east-1';
    }
  }

  return {
    ...baseCreds,
    awsRegion: region,
    ...(roleArn && { awsRoleArn: roleArn }),
  };
}

async function getPodIdentityCredentials(
  awsRegion?: string
): Promise<AWSCredentials | null> {
  if (
    !Environment({}).AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE ||
    !Environment({}).AWS_CONTAINER_CREDENTIALS_FULL_URI
  ) {
    return null;
  }

  try {
    const effectiveRegion = awsRegion || getRegionFromEnv() || 'us-east-1';
    const credentialFullUri = Environment(
      {}
    ).AWS_CONTAINER_CREDENTIALS_FULL_URI;

    const token = await fs.readFile(
      Environment({}).AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE,
      'utf8'
    );

    const credentials = await fetchPodIdentityCredentials(
      token.trim(),
      credentialFullUri
    );

    if (credentials) {
      const result = {
        source: 'EKS Pod Identity',
        ...credentials,
        awsRegion: effectiveRegion,
      };
      return result;
    }
  } catch (error) {
    logger.info({
      message: `Failed to get Pod Identity credentials: ${error}`,
    });
  }
  return null;
}

// Cached wrapper for ECS Container credentials
async function getCredentialsFromECSContainer(): Promise<AWSCredentials | null> {
  if (!Environment({}).AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
    return null;
  }

  const credentials = await fetchECSContainerCredentials(
    Environment({}).AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
  );

  if (!credentials) {
    return null;
  }

  const derivedRegion =
    getRegionFromEnv() || (await fetchECSRegionFromMetadata()) || 'us-east-1';

  const derivedRoleArn =
    credentials.awsRoleArn ||
    Environment({}).AWS_ROLE_ARN ||
    (await fetchECSTaskRoleArnFromMetadata());

  const result = {
    ...credentials,
    awsRoleArn: derivedRoleArn || undefined,
    awsRegion: derivedRegion,
  };

  return result;
}

// Cached wrapper for IMDS credentials
async function getIMDSAssumedCredentials(): Promise<AWSCredentials | null> {
  const credentials = await fetchIMDSAllCredentials();

  return credentials;
}

export async function fetchAssumedRoleCredentials(
  awsRoleArn?: string,
  awsExternalId?: string,
  awsRegion?: string,
  accessKey?: string,
  secretKey?: string
): Promise<AWSCredentials | null> {
  let accessKeyId = accessKey || Environment({}).AWS_ASSUME_ROLE_ACCESS_KEY_ID;
  let secretAccessKey =
    secretKey || Environment({}).AWS_ASSUME_ROLE_SECRET_ACCESS_KEY;
  let sessionToken;

  if (!accessKeyId && !secretAccessKey) {
    let credentials: AWSCredentials | undefined | null =
      getCredentialsFromEnvironment();

    if (!credentials) {
      credentials = await getCredentialsFromSharedCredentialsFile();
    }
    if (!credentials) {
      credentials = await getCredentialsFromAwsConfigFile();
    }
    if (!credentials) {
      try {
        credentials = await getAssumedWebIdentityCredentials(awsRegion);
      } catch (error) {
        logger.error(error);
      }
    }
    if (!credentials) {
      try {
        credentials = await getPodIdentityCredentials(awsRegion);
      } catch (error) {
        logger.error(error);
      }
    }
    if (!credentials) {
      try {
        credentials = await getCredentialsFromECSContainer();
      } catch (error) {
        logger.error(error);
      }
    }
    if (!credentials) {
      try {
        credentials = await getIMDSAssumedCredentials();
      } catch (error) {
        logger.error(error);
      }
    }

    if (!awsRoleArn || credentials?.awsRoleArn === awsRoleArn) {
      return credentials || null;
    }

    accessKeyId = credentials?.accessKeyId;
    secretAccessKey = credentials?.secretAccessKey;
    sessionToken = credentials?.sessionToken;
  }

  if (!awsRoleArn) {
    return {
      accessKeyId: accessKeyId || '',
      secretAccessKey: secretAccessKey || '',
      sessionToken,
      awsRegion,
      awsRoleArn,
    };
  }
  return fetchSTSAssumeRoleCredentials(
    awsRoleArn,
    awsRegion || getRegionFromEnv() || 'us-east-1',
    accessKeyId,
    secretAccessKey,
    sessionToken,
    awsExternalId
  );
}

// Initialize file-based credentials on module load (no Redis dependency)
await getCredentialsFromSharedCredentialsFile();
await getCredentialsFromAwsConfigFile();
