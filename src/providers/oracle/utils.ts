import { OpenAIMessageRole } from '../../types/requestBody';
import { CryptoUtils } from '../../utils/CryptoUtils';
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
}
