import { CONTENT_TYPES } from '../globals';

export async function getTransformedResponse(_: {
  response: Response;
  transformer: (base64Image: string) => Record<string, any>;
}): Promise<Response | undefined> {
  const { response, transformer } = _;

  console.info('imageToJsonHandler > converting image response to base64 JSON');
  const imageBuffer = await response.arrayBuffer();
  // Simple ArrayBuffer to base64 conversion for environments like Cloudflare Workers
  let binary = '';
  const bytes = new Uint8Array(imageBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return new Response(JSON.stringify(transformer(btoa(binary))), {
    headers: {
      ...Object.fromEntries(response.headers), // keep original headers
      'content-type': CONTENT_TYPES.APPLICATION_JSON,
    },
    status: response.status,
    statusText: response.statusText,
  });
}
