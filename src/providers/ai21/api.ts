import { ProviderAPIConfig } from "../types";

const AI21APIConfig: ProviderAPIConfig = {
  baseURL: "https://api.ai21.com/studio/v1",
  headers: (API_KEY:string) => {
    return {"Authorization": `Bearer ${API_KEY}`}
  },
  getEndpoint: (fn:string, MODEL_TYPE:string) => {
    switch(fn) {
      case 'complete': {
        return `/j2-${MODEL_TYPE}/complete`
      }
    }
  }
};

export default AI21APIConfig;
