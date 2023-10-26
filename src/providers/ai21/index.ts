import { ProviderConfigs } from "../types";
import { AI21CompleteConfig, AI21CompleteResponseTransform } from "./complete";
import AI21APIConfig from "./api";

const AI21Config: ProviderConfigs = {
  complete: AI21CompleteConfig,
  api: AI21APIConfig,
  responseTransforms: {
    complete: AI21CompleteResponseTransform,
  },
};

export default AI21Config;
