// Crypto utilities that work in both Node.js and Cloudflare Workers
export class CryptoUtils {
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
