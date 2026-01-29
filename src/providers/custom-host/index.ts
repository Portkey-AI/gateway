import { ProviderConfigs } from '../types';
import CustomHostApiConfig from './api';

const CustomHostConfig: ProviderConfigs = {
    api: CustomHostApiConfig,
    responseTransforms: {},
};

export default CustomHostConfig;
