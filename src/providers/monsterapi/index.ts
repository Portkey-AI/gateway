import { ProviderConfigs } from "../types";
import MonsterAPIConfig from "./api";
import { MessageGenerateConfig } from "./messageGenerate";
import { MessageGenerateResponseTransform } from "./messageGenerateResponseTransform";

const MonsterConfig: ProviderConfigs = {
  api: MonsterAPIConfig,
  messageGenerate: MessageGenerateConfig,
  responseTransforms: {
    messageGenerate: MessageGenerateResponseTransform,
  },
};

export default MonsterConfig;
