import { ProviderAPIConfig } from "../types";

const StabilityAIAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.segmind.com/v1",
  headers: (API_KEY:string) => {
    return {"x-api-key": `${API_KEY}`}
  },
  getEndpoint: (fn:string, ENGINE_ID:string, url?: string) => {
    // TODO: need to check this
    // let mappedFn = fn;
    // if (fn === "proxy" && url && url?.indexOf("text-to-image") > -1) {
    //   mappedFn = "imageGenerate"
    // }

    // switch(mappedFn) {
    //   case 'imageGenerate': {
    //     return `/generation/${ENGINE_ID}/text-to-image`
    //   }
    // }
    return `/${ENGINE_ID}`
  }
};

export default StabilityAIAPIConfig;
