import { ProviderAPIConfig } from "../types";

const AzureOpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: (RESOURCE_NAME:string, DEPLOYMENT_ID:string) => `https://${RESOURCE_NAME}.openai.azure.com/openai/deployments/${DEPLOYMENT_ID}`,
  headers: (API_KEY:string, TYPE:string) => {
    switch(TYPE) {
      case 'apiKey': {
        return {"api-key": `${API_KEY}`}
      }
      case 'adAuth': {
        return {"Authorization": `Bearer ${API_KEY}`}
      }
    }
  },
  getEndpoint: (fn:string, API_VERSION:string, url?: string) => {
    let mappedFn = fn;
    if (fn === "proxy" && url && url?.indexOf("/chat/completions") > -1) {
      mappedFn = "chatComplete"
    } else if (fn === "proxy" && url && url?.indexOf("/completions") > -1) {
      mappedFn = "complete"
    } else if (fn === "proxy" && url && url?.indexOf("/embeddings") > -1) {
      mappedFn = "embed"
    } 

    switch(mappedFn) {
      case 'complete': {
        return `/completions?api-version=${API_VERSION}`
      }
      case 'chatComplete': {
        return `/chat/completions?api-version=${API_VERSION}`
      }
      case 'embed': {
        return `/embeddings?api-version=${API_VERSION}`
      }
    }
  }
};

export default AzureOpenAIAPIConfig;
