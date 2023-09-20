import { ProviderAPIConfig } from "../types";

const AnyscaleAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.endpoints.anyscale.com/v1",
  headers: (API_KEY:string) => {
    return {"Authorization": `Bearer ${API_KEY}`}
  },
  complete: "/completions",
  chatComplete: "/chat/completions",
};

export default AnyscaleAPIConfig;
