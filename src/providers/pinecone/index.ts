import { ProviderConfigs } from '../types';
import PineconeAPIConfig from './api';
import {
  PineconeRerankConfig,
  PineconeRerankResponseTransform,
} from './rerank';

const PineconeConfig: ProviderConfigs = {
  rerank: PineconeRerankConfig,
  api: PineconeAPIConfig,
  responseTransforms: {
    rerank: PineconeRerankResponseTransform,
  },
};

export default PineconeConfig;
