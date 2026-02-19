import { ProviderConfigs } from '../types';
import SagemakerAPIConfig from './api';
import { SagemakerLogConfig } from './pricing';

const SagemakerConfig: ProviderConfigs = {
  api: SagemakerAPIConfig,
  pricing: SagemakerLogConfig,
};

export default SagemakerConfig;
