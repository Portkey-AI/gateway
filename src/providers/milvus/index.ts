import { ProviderConfigs } from '../types';
import MilvusAPIConfig from './api';

const MilvusConfig: ProviderConfigs = {
  api: MilvusAPIConfig,
  responseTransforms: {},
};

export default MilvusConfig;
