import { ProviderAPIConfig } from '../types';

const DeepgramAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.deepgram.com',
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Token ${providerOptions.apiKey}`,
    };
    // TTS uses JSON body; STT uses raw audio bytes (handled by requestHandler)
    if (fn === 'createSpeech') {
      headersObj['Content-Type'] = 'application/json';
    }
    return headersObj;
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON }) => {
    const body = gatewayRequestBodyJSON as Record<string, any> | undefined;
    switch (fn) {
      case 'createTranscription': {
        // Parameters go as query params for Deepgram
        const params = new URLSearchParams();
        const model = body?.model || body?.model_id || 'nova-2';
        params.set('model', model);
        if (body?.language) params.set('language', body.language);
        if (body?.smart_format) params.set('smart_format', 'true');
        if (body?.punctuate) params.set('punctuate', 'true');
        if (body?.diarize) params.set('diarize', 'true');
        return `/v1/listen?${params.toString()}`;
      }
      case 'createSpeech': {
        const params = new URLSearchParams();
        const model = body?.model || 'aura-asteria-en';
        params.set('model', model);
        return `/v1/speak?${params.toString()}`;
      }
      default:
        return '';
    }
  },
};

export default DeepgramAPIConfig;
