import { ProviderAPIConfig } from '../types';

// Good reference for using REST: https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstarts/quickstart-multimodal#gemini-beginner-samples-drest
// Difference versus Studio AI: https://cloud.google.com/vertex-ai/docs/start/ai-platform-users
export const GoogleApiConfig: ProviderAPIConfig = {
  getBaseURL: (LOCATION: string, PROJECT_ID: string) => {
    if (!PROJECT_ID) {
      throw new Error(
        'Project ID is required for Vertex AI. See https://cloud.google.com/resource-manager/docs/creating-managing-projects#identifying_projects',
      );
    }

    if (!LOCATION) {
      throw new Error(
        'Location is required for Vertex AI. See locations at https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations?hl=en#available-regions',
      );
    }

    return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google`;
  },
  headers: (API_KEY: string) => {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    };
  },
  getEndpoint: (fn: string, model: string, stream: boolean) => {
    let mappedFn = fn;
    if (stream) {
      mappedFn = `stream-${fn}`;
    }
    switch (mappedFn) {
      case 'chatComplete': {
        return `/models/${model}:generateContent`;
      }
      case 'stream-chatComplete': {
        return `/models/${model}:streamGenerateContent`;
      }
    }
  },
};

export default GoogleApiConfig;
