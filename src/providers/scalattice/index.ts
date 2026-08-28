import { SCALATTICE } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import ScalatticeAPIConfig from './api';

const ScalatticeConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([
    'functions',
    'function_call',
    'user',
    'seed',
    'tools',
    'tool_choice',
    'stream_options',
    'response_format',
  ]),
  api: ScalatticeAPIConfig,
  responseTransforms: {
    ...responseTransformers(SCALATTICE, { chatComplete: true }),
  },
};

export default ScalatticeConfig;
