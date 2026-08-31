import { ProviderConfigs } from '../types';
import IFlytekAPIConfig from './api';
import {
  IFlytekChatCompleteConfig,
  IFlytekChatCompleteResponseTransform,
  IFlytekChatCompleteStreamChunkTransform,
} from './chatComplete';

const IFlytekConfig: ProviderConfigs = {
  chatComplete: IFlytekChatCompleteConfig,
  api: IFlytekAPIConfig,
  responseTransforms: {
    chatComplete: IFlytekChatCompleteResponseTransform,
    'stream-chatComplete': IFlytekChatCompleteStreamChunkTransform,
  },
};

export default IFlytekConfig;
