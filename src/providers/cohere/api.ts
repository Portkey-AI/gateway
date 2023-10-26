import { ProviderAPIConfig } from "../types";

const CohereAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.cohere.ai/v1",
  headers: (API_KEY:string) => {
    return {"Authorization": `Bearer ${API_KEY}`}
  },
  complete: "/generate",
  chatComplete: "/generate",
  embed: "/embed"
};

export default CohereAPIConfig;
