import { ProviderAPIConfig } from "../types";

const AnyscaleAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.endpoints.anyscale.com/v1",
  headers: (API_KEY:string) => {
    return {"Authorization": `Bearer ${API_KEY}`}
  },
  chatComplete: "/chat/completions",
  complete: "/completions",
  embed: "/embeddings"
};

export default AnyscaleAPIConfig;
