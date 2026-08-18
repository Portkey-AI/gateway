import { ProviderConfigs } from '../types';
import TritonAPIConfig from './api';
import {
  TritonCompleteConfig,
  TritonCompleteResponseTransform,
} from './complete';
import { TritonEmbedConfig, TritonEmbedResponseTransform } from './embed';

const TritonConfig: ProviderConfigs = {
  api: TritonAPIConfig,
  complete: TritonCompleteConfig,
  embed: TritonEmbedConfig,
  responseTransforms: {
    complete: TritonCompleteResponseTransform,
    embed: TritonEmbedResponseTransform,
  },
};

export default TritonConfig;
