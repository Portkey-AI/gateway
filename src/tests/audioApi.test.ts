import testVariables from './resources/testVariables';
import {
  executeCreateSpeechEndpointTests,
  executeCreateTranscriptionEndpointTests,
  executeCreateTranslationEndpointTests,
} from './routeSpecificTestFunctions.ts/audioApi';

for (const provider in testVariables) {
  const variables = testVariables[provider];

  if (!variables.apiKey) {
    console.log(`Skipping ${provider} audio tests as API key is not provided`);
    continue;
  }

  if (variables.createSpeech) {
    describe(`${provider} /audio/speech endpoint tests:`, () =>
      executeCreateSpeechEndpointTests(provider, variables));
  }

  if (variables.createTranscription) {
    describe(`${provider} /audio/transcriptions endpoint tests:`, () =>
      executeCreateTranscriptionEndpointTests(provider, variables));
  }

  if (variables.createTranslation) {
    describe(`${provider} /audio/translations endpoint tests:`, () =>
      executeCreateTranslationEndpointTests(provider, variables));
  }
}
