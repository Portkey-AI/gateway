import { ProviderConfigs } from '../types';
import CustomHostAPIConfig from './api';

const CustomHostConfig: ProviderConfigs = {
  api: CustomHostAPIConfig,
  responseTransforms: {},
};

export default CustomHostConfig;
