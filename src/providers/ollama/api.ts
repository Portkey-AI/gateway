import { ProviderAPIConfig } from "../types";

const OllamaAPIConfig: ProviderAPIConfig = {
  headers: () => {
    return {};
  },
  chatComplete: "/v1/chat/completions",
  embed:"/api/embeddings",
  getEndpoint: (fn: string, API_VERSION: string, url?: string) => {
    let mappedFn = fn;
    if (fn === "proxy" && url && url?.indexOf("/chat/completions") > -1) {
      mappedFn = "chatComplete";
    } else if (fn === "proxy" && url && url?.indexOf("/embeddings") > -1) {
      mappedFn = "embed";
    }

    switch (mappedFn) {
      case "chatComplete": {
        return `/v1/chat/completions`;
      }
      case "embed": {
        return `/api/embeddings`;
      }
    }
  },
};

export default OllamaAPIConfig;
