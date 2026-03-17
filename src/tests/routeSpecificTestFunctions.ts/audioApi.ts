import app from '../..';
import {
  AUDIO_SPEECH_ENDPOINT,
  AUDIO_TRANSCRIPTIONS_ENDPOINT,
  AUDIO_TRANSLATIONS_ENDPOINT,
} from '../resources/constants';
import { TestVariable } from '../resources/testVariables';
import { createDefaultHeaders } from '../resources/utils';

export const executeCreateSpeechEndpointTests: (
  providerName: string,
  providerVariables: TestVariable
) => void = (providerName, providerVariables) => {
  const apiKey = providerVariables.apiKey;
  const speechConfig = providerVariables.createSpeech;

  if (!apiKey || !speechConfig) {
    console.warn(
      `Skipping ${providerName} createSpeech as speech options are not configured`
    );
    return;
  }

  // ElevenLabs uses 'text' instead of 'input'
  const isElevenLabs = providerName === 'elevenlabs';
  // Deepgram uses 'text' too
  const isDeepgram = providerName === 'deepgram';

  if (!isElevenLabs && !isDeepgram) {
    test(`${providerName} /audio/speech basic TTS request`, async () => {
      const res = await fetch(AUDIO_SPEECH_ENDPOINT, {
        method: 'POST',
        headers: createDefaultHeaders(providerName, apiKey),
        body: JSON.stringify({
          model: speechConfig.model,
          input: 'Hello, this is a test of text to speech.',
          voice: speechConfig.voice || 'alloy',
        }),
      });

      expect(res.status).toEqual(200);
    });
  }

  if (isElevenLabs) {
    test(`${providerName} /audio/speech TTS request`, async () => {
      const res = await fetch(AUDIO_SPEECH_ENDPOINT, {
        method: 'POST',
        headers: createDefaultHeaders(providerName, apiKey),
        body: JSON.stringify({
          model_id: speechConfig.model,
          text: 'Hello from ElevenLabs.',
          voice_id: '21m00Tcm4TlvDq8ikWAM',
        }),
      });

      expect(res.status).toEqual(200);
    });
  }

  if (isDeepgram) {
    test(`${providerName} /audio/speech TTS request`, async () => {
      const res = await fetch(AUDIO_SPEECH_ENDPOINT, {
        method: 'POST',
        headers: createDefaultHeaders(providerName, apiKey),
        body: JSON.stringify({
          text: 'Hello from Deepgram.',
        }),
      });

      expect(res.status).toEqual(200);
    });
  }
};

export const executeCreateTranscriptionEndpointTests: (
  providerName: string,
  providerVariables: TestVariable,
  audioFilePath?: string
) => void = (
  providerName,
  providerVariables,
  audioFilePath = './src/handlers/tests/speech2.mp3'
) => {
  const apiKey = providerVariables.apiKey;
  const transcriptionConfig = providerVariables.createTranscription;

  if (!apiKey || !transcriptionConfig) {
    console.warn(
      `Skipping ${providerName} createTranscription as transcription options are not configured`
    );
    return;
  }

  test(`${providerName} /audio/transcriptions basic transcription request`, async () => {
    let audioBlob: Blob;
    try {
      const { readFileSync } = await import('fs');
      audioBlob = new Blob([new Uint8Array(readFileSync(audioFilePath))], {
        type: 'audio/mpeg',
      });
    } catch {
      console.warn(
        `Skipping ${providerName} transcription: audio file not found at ${audioFilePath}`
      );
      return;
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'speech.mp3');
    formData.append('model', transcriptionConfig.model);

    // Remove Content-Type header for multipart
    const { 'Content-Type': _, ...headersWithoutCT } = createDefaultHeaders(
      providerName,
      apiKey
    );

    const res = await fetch(AUDIO_TRANSCRIPTIONS_ENDPOINT, {
      method: 'POST',
      headers: headersWithoutCT,
      body: formData,
    });

    expect(res.status).toEqual(200);
    const data: any = await res.json();
    expect(data.text).toBeDefined();
  });
};

export const executeCreateTranslationEndpointTests: (
  providerName: string,
  providerVariables: TestVariable,
  audioFilePath?: string
) => void = (
  providerName,
  providerVariables,
  audioFilePath = './src/handlers/tests/speech2.mp3'
) => {
  const apiKey = providerVariables.apiKey;
  const translationConfig = providerVariables.createTranslation;

  if (!apiKey || !translationConfig) {
    console.warn(
      `Skipping ${providerName} createTranslation as translation options are not configured`
    );
    return;
  }

  test(`${providerName} /audio/translations basic translation request`, async () => {
    let audioBlob: Blob;
    try {
      const { readFileSync } = await import('fs');
      audioBlob = new Blob([new Uint8Array(readFileSync(audioFilePath))], {
        type: 'audio/mpeg',
      });
    } catch {
      console.warn(
        `Skipping ${providerName} translation: audio file not found at ${audioFilePath}`
      );
      return;
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'speech.mp3');
    formData.append('model', translationConfig.model);

    const { 'Content-Type': _, ...headersWithoutCT } = createDefaultHeaders(
      providerName,
      apiKey
    );

    const res = await fetch(AUDIO_TRANSLATIONS_ENDPOINT, {
      method: 'POST',
      headers: headersWithoutCT,
      body: formData,
    });

    expect(res.status).toEqual(200);
    const data: any = await res.json();
    expect(data.text).toBeDefined();
  });
};
