import { GoogleErrorResponse } from './types';
import { generateErrorResponse } from '../utils';
import { fileExtensionMimeTypeMap, GOOGLE_VERTEX_AI } from '../../globals';
import { ErrorResponse } from '../types';

/**
 * Encodes an object as a Base64 URL-encoded string.
 * @param obj The object to encode.
 * @returns The Base64 URL-encoded string.
 */
function base64UrlEncode(obj: Record<string, any>): string {
  return btoa(JSON.stringify(obj))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const createJWT = async (
  header: Record<string, any>,
  payload: Record<string, any>,
  privateKey: CryptoKey
): Promise<string> => {
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);

  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign(
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );

  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
};

/**
 * Imports a PEM-formatted private key into a CryptoKey object.
 * @param pem The PEM-formatted private key.
 * @returns The imported private key.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);

  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  );
}

export const getAccessToken = async (
  serviceAccountInfo: Record<string, any>
): Promise<string> => {
  try {
    const scope = 'https://www.googleapis.com/auth/cloud-platform';
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600; // Token expiration time (1 hour)

    const payload = {
      iss: serviceAccountInfo.client_email,
      sub: serviceAccountInfo.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: iat,
      exp: exp,
      scope: scope,
    };

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: serviceAccountInfo.private_key_id,
    };

    const privateKey = await importPrivateKey(serviceAccountInfo.private_key);

    const jwtToken = await createJWT(header, payload, privateKey);

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const tokenHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const tokenData = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtToken,
    });

    const tokenResponse = await fetch(tokenUrl, {
      headers: tokenHeaders,
      body: tokenData,
      method: 'POST',
    });

    const tokenJson: Record<string, any> = await tokenResponse.json();

    return tokenJson.access_token;
  } catch (err) {
    return '';
  }
};

export const getModelAndProvider = (modelString: string) => {
  let provider = 'google';
  let model = modelString;
  const modelStringParts = modelString.split('.');
  if (
    modelStringParts.length > 1 &&
    ['google', 'anthropic', 'meta'].includes(modelStringParts[0])
  ) {
    provider = modelStringParts[0];
    model = modelStringParts.slice(1).join('.');
  }

  return { provider, model };
};

export const getMimeType = (url: string): string | undefined => {
  const urlParts = url.split('.');
  const extension = urlParts[
    urlParts.length - 1
  ] as keyof typeof fileExtensionMimeTypeMap;
  const mimeType = fileExtensionMimeTypeMap[extension];
  return mimeType;
};

export const GoogleErrorResponseTransform: (
  response: GoogleErrorResponse,
  provider?: string
) => ErrorResponse | undefined = (response, provider = GOOGLE_VERTEX_AI) => {
  if ('error' in response) {
    return generateErrorResponse(
      {
        message: response.error.message ?? '',
        type: response.error.status ?? null,
        param: null,
        code: response.error.status ?? null,
      },
      provider
    );
  }

  return undefined;
};

const getDefFromRef = (ref: string) => {
  const refParts = ref.split('/');
  return refParts.at(-1);
};

const getRefParts = (spec: Record<string, any>, ref: string) => {
  return spec?.[ref];
};

export const derefer = (spec: Record<string, any>, defs = null) => {
  const original = { ...spec };

  const finalDefs = defs ?? original?.['$defs'];
  const entries = Object.entries(original);

  for (let [key, object] of entries) {
    if (key === '$defs') {
      continue;
    }
    if (typeof object === 'string' || Array.isArray(object)) {
      continue;
    }
    const ref = object?.['$ref'];
    if (ref) {
      const def = getDefFromRef(ref);
      const defData = getRefParts(finalDefs, def ?? '');
      const newValue = derefer(defData, finalDefs);
      original[key] = newValue;
    } else {
      const newValue = derefer(object, finalDefs);
      original[key] = newValue;
    }
  }
  return original;
};
