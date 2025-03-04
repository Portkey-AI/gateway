import { ProviderConfigs } from '../types';
import ReplicateAPIConfig from './api';

const ReplicateConfig: ProviderConfigs = {
  api: ReplicateAPIConfig,
  responseTransforms: {},
};

export default ReplicateConfig;
