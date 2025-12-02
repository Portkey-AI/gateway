import { OpenAIMessageRole } from '../../types/requestBody';
import { OracleMessageRole } from './types/ChatDetails';

export const openAIToOracleRoleMap: Record<
  OpenAIMessageRole,
  OracleMessageRole
> = {
  system: 'SYSTEM',
  user: 'USER',
  assistant: 'ASSISTANT',
  developer: 'SYSTEM',
  tool: 'TOOL',
  function: 'TOOL',
};

export const oracleToOpenAIRoleMap: Record<
  OracleMessageRole,
  OpenAIMessageRole
> = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  DEVELOPER: 'developer',
  TOOL: 'tool',
};

interface OCIConfig {
  tenancy: string;
  user: string;
  fingerprint: string;
  privateKey: string; // PEM format
  region: string;
  keyPassphrase?: string;
}

interface SigningHeaders {
  [key: string]: string;
}

// Crypto utilities that work in both Node.js and Cloudflare Workers
class CryptoUtils {
  /**
   * Normalize a PEM key that might be missing newlines
   */
  private static normalizePemKey(pemKey: string): string {
    // Remove all whitespace first
    let normalized = pemKey.trim().replace(/\s+/g, '');

    // Check for BEGIN/END markers
    const beginMarkers = [
      '-----BEGINPRIVATEKEY-----',
      '-----BEGINRSAPRIVATEKEY-----',
      '-----BEGINENCRYPTEDPRIVATEKEY-----',
    ];

    const endMarkers = [
      '-----ENDPRIVATEKEY-----',
      '-----ENDRSAPRIVATEKEY-----',
      '-----ENDENCRYPTEDPRIVATEKEY-----',
    ];

    let beginMarker = '';
    let endMarker = '';
    let keyContent = normalized;

    // Find which markers are present
    for (let i = 0; i < beginMarkers.length; i++) {
      if (normalized.includes(beginMarkers[i])) {
        beginMarker = beginMarkers[i];
        endMarker = endMarkers[i];
        // Extract content between markers
        const startIdx = normalized.indexOf(beginMarker) + beginMarker.length;
        const endIdx = normalized.indexOf(endMarker);
        keyContent = normalized.substring(startIdx, endIdx);
        break;
      }
    }

    // If no markers found, assume the whole thing is the key content
    if (!beginMarker) {
      beginMarker = '-----BEGINPRIVATEKEY-----';
      endMarker = '-----ENDPRIVATEKEY-----';
    }

    // Reformat with proper newlines (64 chars per line is PEM standard)
    const formattedContent =
      keyContent.match(/.{1,64}/g)?.join('\n') || keyContent;

    // Reconstruct with proper spacing
    const properBegin = beginMarker
      .replace('-----BEGIN', '-----BEGIN ')
      .replace('KEY-----', ' KEY-----');
    const properEnd = endMarker
      .replace('-----END', '-----END ')
      .replace('KEY-----', ' KEY-----');

    return `${properBegin}\n${formattedContent}\n${properEnd}`;
  }

  private static async importPrivateKey(
    pemKey: string,
    passphrase?: string
  ): Promise<CryptoKey> {
    // Normalize the key first
    const normalizedKey = this.normalizePemKey(pemKey);

    // Remove PEM headers and decode base64
    const pemHeader = '-----BEGIN';
    const pemFooter = '-----END';
    const pemContents = normalizedKey
      .split('\n')
      .filter((line) => !line.includes(pemHeader) && !line.includes(pemFooter))
      .join('');

    const binaryDer = this.base64ToArrayBuffer(pemContents);

    // Import the key using Web Crypto API
    try {
      return await crypto.subtle.importKey(
        'pkcs8',
        binaryDer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        false,
        ['sign']
      );
    } catch (error) {
      throw new Error(
        `Failed to import private key. Ensure it's in PKCS8 format. Use: openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in key.pem -out key_pkcs8.pem`
      );
    }
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString =
      typeof atob !== 'undefined'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('binary');

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return typeof btoa !== 'undefined'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');
  }

  static async sign(privateKey: CryptoKey, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      dataBuffer
    );

    return this.arrayBufferToBase64(signature);
  }

  static async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return this.arrayBufferToBase64(hashBuffer);
  }

  static async loadPrivateKey(
    pemKey: string,
    passphrase?: string
  ): Promise<CryptoKey> {
    if (passphrase) {
      console.warn(
        'Key passphrase provided but not supported in Web Crypto API. Please use an unencrypted key.'
      );
    }
    return this.importPrivateKey(pemKey, passphrase);
  }
}

export class OCIRequestSigner {
  private config: OCIConfig;
  private privateKey: Promise<CryptoKey>;

  constructor(config: OCIConfig) {
    this.config = config;
    this.privateKey = CryptoUtils.loadPrivateKey(
      config.privateKey,
      config.keyPassphrase
    );
  }

  /**
   * Sign an OCI API request
   * @param method HTTP method (GET, POST, PUT, PATCH, DELETE)
   * @param url Full URL or path (e.g., "https://iaas.us-phoenix-1.oraclecloud.com/20160918/instances" or "/20160918/instances")
   * @param body Request body (for POST/PUT/PATCH)
   * @param additionalHeaders Additional headers to include
   */
  public async signRequest(
    method: string,
    url: string,
    body?: string,
    additionalHeaders?: SigningHeaders
  ): Promise<SigningHeaders> {
    // Parse URL to extract host and path
    let host: string;
    let path: string;

    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url);
      host = urlObj.host;
      path = urlObj.pathname + urlObj.search;
    } else {
      // If no host provided, construct default host
      host = `iaas.${this.config.region}.oraclecloud.com`;
      path = url;
    }

    const date = new Date().toUTCString();

    // Required headers
    const headers: SigningHeaders = {
      host,
      date,
      ...additionalHeaders,
    };

    // Determine which headers to sign based on the Postman script
    const headersToSign = ['(request-target)', 'date', 'host'];
    const signingStringParts: string[] = [];

    // Add request target
    const escapedTarget = encodeURI(path);
    signingStringParts.push(
      `(request-target): ${method.toLowerCase()} ${escapedTarget}`
    );
    signingStringParts.push(`date: ${date}`);
    signingStringParts.push(`host: ${host}`);

    // Add content headers for POST/PUT/PATCH (matching Postman order)
    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      const encoder = new TextEncoder();
      const bodyBytes = encoder.encode(body);
      const contentLength = bodyBytes.length.toString();
      const contentSHA256 = await CryptoUtils.sha256(body);

      headers['x-content-sha256'] = contentSHA256;
      headers['content-type'] = headers['content-type'] || 'application/json';
      headers['content-length'] = contentLength;

      // Add to signing string in the EXACT order from Postman
      signingStringParts.push(`x-content-sha256: ${contentSHA256}`);
      signingStringParts.push(`content-type: ${headers['content-type']}`);
      signingStringParts.push(`content-length: ${contentLength}`);

      // Add to headers list
      headersToSign.push('x-content-sha256', 'content-type', 'content-length');
    }

    // Create signing string
    const signingString = signingStringParts.join('\n');

    // Sign the request
    const privateKey = await this.privateKey;
    const signature = await CryptoUtils.sign(privateKey, signingString);

    // Create authorization header (matching Postman format exactly)
    const keyId = `${this.config.tenancy}/${this.config.user}/${this.config.fingerprint}`;
    const headersString = headersToSign.join(' ');
    headers['authorization'] =
      `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${headersString}",signature="${signature}"`;

    return headers;
  }

  /**
   * Helper method to make signed requests
   */
  public async makeRequest(
    method: string,
    url: string,
    body?: any
  ): Promise<Response> {
    const bodyString = body ? JSON.stringify(body) : undefined;
    const headers = await this.signRequest(method, url, bodyString);

    // Construct full URL if needed
    const fullUrl = url.startsWith('http')
      ? url
      : `https://${headers.host}${url}`;

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: bodyString,
    });

    return response;
  }

  /**
   * Debug helper to see the signing string
   */
  public async debugSigningString(
    method: string,
    url: string,
    body?: string
  ): Promise<string> {
    // Parse URL
    let host: string;
    let path: string;

    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url);
      host = urlObj.host;
      path = urlObj.pathname + urlObj.search;
    } else {
      host = `iaas.${this.config.region}.oraclecloud.com`;
      path = url;
    }

    const date = new Date().toUTCString();
    const escapedTarget = encodeURI(path);

    const signingStringParts: string[] = [
      `(request-target): ${method.toLowerCase()} ${escapedTarget}`,
      `date: ${date}`,
      `host: ${host}`,
    ];

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      const contentSHA256 = await CryptoUtils.sha256(body);
      const encoder = new TextEncoder();
      const contentLength = encoder.encode(body).length.toString();

      signingStringParts.push(`x-content-sha256: ${contentSHA256}`);
      signingStringParts.push(`content-type: application/json`);
      signingStringParts.push(`content-length: ${contentLength}`);
    }

    return signingStringParts.join('\n');
  }
}

// Example usage
export function createOCISigner(config: OCIConfig): OCIRequestSigner {
  return new OCIRequestSigner(config);
}

// Usage examples:
/*
const signer = createOCISigner({
  tenancy: 'ocid1.tenancy.oc1..aaaaaaaa...',
  user: 'ocid1.user.oc1..aaaaaaaa...',
  fingerprint: 'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99',
  region: 'us-phoenix-1',
  privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
-----END PRIVATE KEY-----`,
});

// Example 1: GET request with query parameters
const getResponse = await signer.makeRequest(
  'GET',
  'https://announcements.us-ashburn-1.oraclecloud.com/20180904/announcements?compartmentId=ocid1.tenancy.oc1...'
);

// Example 2: POST request
const postResponse = await signer.makeRequest(
  'POST',
  'https://streams.us-ashburn-1.streaming.oci.oraclecloud.com/20180418/streams',
  {
    compartmentId: 'ocid1.compartment.oc1...',
    name: 'mynewstream',
    partitions: '1'
  }
);

// Example 3: Debug signing string
const signingString = await signer.debugSigningString(
  'POST',
  'https://iaas.us-phoenix-1.oraclecloud.com/20160918/instances',
  '{"compartmentId":"ocid1..."}'
);
console.log('Signing string:', signingString);

// Example 4: Get headers only (for manual requests)
const headers = await signer.signRequest(
  'GET',
  '/20160918/instances?compartmentId=ocid1...'
);
console.log('Headers:', headers);
*/
