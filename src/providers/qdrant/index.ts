import { ProviderConfigs } from '../types';
import QdrantAPIConfig from './api';

const QdrantConfig: ProviderConfigs = {
  api: QdrantAPIConfig,
  responseTransforms: {},
};

export default QdrantConfig;
