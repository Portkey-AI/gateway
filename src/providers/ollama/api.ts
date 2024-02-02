import { ProviderAPIConfig } from "../types";

const OllamaAPIConfig: ProviderAPIConfig = {
  headers: () => {
    return null;
  },
  chatComplete: "/api/chat",
  complete:"/api/generate",
  embed:"/api/embeddings",
  getEndpoint: (fn: string, API_VERSION: string, url?: string) => {
    let mappedFn = fn;
    if (fn === "proxy" && url && url?.indexOf("/chat/completions") > -1) {
      mappedFn = "chatComplete";
    } else if (fn === "proxy" && url && url?.indexOf("/completions") > -1) {
      mappedFn = "complete";
    } else if (fn === "proxy" && url && url?.indexOf("/embeddings") > -1) {
      mappedFn = "embed";
    }

    switch (mappedFn) {
      case "complete": {
        return `/api/generate`;
      }
      case "chatComplete": {
        return `/api/chat`;
      }
      case "embed": {
        return `/api/embeddings`;
      }
    }
  },
};

export default OllamaAPIConfig;
