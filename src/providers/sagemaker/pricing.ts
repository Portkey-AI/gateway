import { LogConfig, ModelInput } from '../types';

export const SagemakerLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return '';
}

function modelConfig(input: ModelInput) {
  const { providerOptions, url } = input;
  const pathname = new URL(url).pathname;
  const fallbackModelName = pathname.split('/')[2] || pathname;
  return (
    providerOptions.amznSagemakerModelName ||
    providerOptions.amznSagemakerTargetModel ||
    fallbackModelName
  );
}

function tokenConfig() {
  return { reqUnits: 0, resUnits: 0 };
}
