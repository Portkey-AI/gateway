import { ProviderConfigs } from '../types';
import OllamaAPIConfig from './api';
import {
    OllamaCompleteConfig,
    OllamaCompleteResponseTransform,
} from './complete';

const OllamaConfig: ProviderConfigs = {
    complete: OllamaCompleteConfig,
    api: OllamaAPIConfig,
    responseTransforms: {
        complete: OllamaCompleteResponseTransform,
    },
};

export default OllamaConfig;
