import { ProviderConfigs } from '../types';
import MeshyAPIConfig from './api';
import {
  MeshyModelGenerateConfig,
  MeshyModelGenerateResponseTransform,
} from './modelGenerate';

const MeshyConfig: ProviderConfigs = {
  modelGenerate: MeshyModelGenerateConfig,
  api: MeshyAPIConfig,
  responseTransforms: {
    modelGenerate: MeshyModelGenerateResponseTransform,
  },
};

export default MeshyConfig;
