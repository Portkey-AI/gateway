import { ProviderConfigs } from "../types";
import AnyscaleAPIConfig from "./api";
import { AnyscaleChatCompleteConfig, AnyscaleChatCompleteResponseTransform, AnyscaleChatCompleteStreamChunkTransform } from "./chatComplete";
import { AnyscaleCompleteConfig, AnyscaleCompleteResponseTransform, AnyscaleCompleteStreamChunkTransform } from "./complete";

const AnyscaleConfig: ProviderConfigs = {
  complete: AnyscaleCompleteConfig,
  chatComplete: AnyscaleChatCompleteConfig,
  api: AnyscaleAPIConfig,
  responseTransforms: {
    'stream-complete': AnyscaleCompleteStreamChunkTransform,
    complete: AnyscaleCompleteResponseTransform,
    'chatComplete': AnyscaleChatCompleteResponseTransform,
    'stream-chatComplete': AnyscaleChatCompleteStreamChunkTransform
  }
};

export default AnyscaleConfig;
