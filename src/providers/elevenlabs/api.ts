import { ProviderAPIConfig } from '../types';

const ElevenLabsAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.elevenlabs.io',
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      'xi-api-key': providerOptions.apiKey ?? '',
    };
    if (fn === 'createTranscription') {
      headersObj['Content-Type'] = 'multipart/form-data';
    } else {
      headersObj['Content-Type'] = 'application/json';
    }
    return headersObj;
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON, gatewayRequestBody }) => {
    switch (fn) {
      case 'createSpeech': {
        // Extract voice_id from request body (supports both JSON and FormData)
        let voiceId = 'EXAVITQu4vr4xnSDxMaL'; // default voice
        
        if (gatewayRequestBodyJSON) {
          voiceId = gatewayRequestBodyJSON.voice_id || voiceId;
        } else if (gatewayRequestBody instanceof FormData) {
          voiceId = gatewayRequestBody.get('voice_id') as string || voiceId;
        }
        
        return `/v1/text-to-speech/${voiceId}`;
      }
      case 'createTranscription':
        return '/v1/speech-to-text';
      default:
        return '';
    }
  },
};

export default ElevenLabsAPIConfig;
