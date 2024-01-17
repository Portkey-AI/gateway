import { ProviderConfigs } from "../types";
import DeepInfraApiConfig from "./api";
import {DeepInfraChatCompleteConfig, DeepInfraChatCompleteStreamChunkTransform} from "./chatComplete";

const DeepInfraConfig: ProviderConfigs = {
    chatComplete: DeepInfraChatCompleteConfig,
    api: DeepInfraApiConfig,
    responseTransforms: {
        chatComplete: DeepInfraChatCompleteConfig,
        "stream-chatComplete": DeepInfraChatCompleteStreamChunkTransform,
    },
};

export default DeepInfraConfig;
