import { DEEPGRAM } from '../../globals';
import { ErrorResponse, ProviderConfig, RequestHandler } from '../types';

export const DeepgramCreateTranscriptionConfig: ProviderConfig = {
  // Transcription params are handled as query params in api.ts
  // The request body is raw audio bytes (handled by requestHandler)
};

/**
 * Custom request handler for Deepgram transcription.
 * Deepgram expects raw audio bytes in the body (not multipart form-data),
 * with parameters passed as query params on the URL.
 */
export const DeepgramCreateTranscriptionRequestHandler: RequestHandler = async ({
  c,
  providerOptions,
  requestHeaders,
  requestBody,
}) => {
  const apiKey = providerOptions.apiKey;

  // Extract form data fields
  let formData: FormData;
  if (requestBody instanceof FormData) {
    formData = requestBody;
  } else {
    // Shouldn't happen for createTranscription, but handle gracefully
    formData = await c.req.raw.formData();
  }

  const file = formData.get('file') as File | null;
  const model = (formData.get('model') || formData.get('model_id') || 'nova-2') as string;
  const language = formData.get('language') as string | null;
  const smartFormat = formData.get('smart_format') as string | null;
  const punctuate = formData.get('punctuate') as string | null;
  const diarize = formData.get('diarize') as string | null;

  if (!file) {
    return new Response(
      JSON.stringify({
        error: {
          message: 'No audio file provided. Please include a "file" field.',
          type: 'invalid_request_error',
          param: 'file',
          code: null,
        },
        provider: DEEPGRAM,
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  // Build query params
  const params = new URLSearchParams();
  params.set('model', model);
  if (language) params.set('language', language);
  if (smartFormat && smartFormat !== 'false') params.set('smart_format', 'true');
  if (punctuate && punctuate !== 'false') params.set('punctuate', 'true');
  if (diarize && diarize !== 'false') params.set('diarize', 'true');

  // Determine content type from file
  const contentType = file.type || 'audio/wav';

  // Get raw bytes from the file
  const audioBytes = await file.arrayBuffer();

  const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    body: audioBytes,
  });

  return response;
};

export const DeepgramCreateTranscriptionResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return {
      error: {
        message: response.error?.message || 'Deepgram API error',
        type: response.error?.type || 'api_error',
        param: null,
        code: null,
      },
      provider: DEEPGRAM,
    };
  }

  return response;
};
