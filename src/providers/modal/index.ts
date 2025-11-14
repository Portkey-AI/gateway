import { MODAL } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { ModalAPIConfig } from './api';

export const ModalConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([]),
  complete: completeParams([]),
  api: ModalAPIConfig,
  responseTransforms: responseTransformers(MODAL, {
    chatComplete: true,
    complete: true,
  }),
};

export default ModalConfig;
