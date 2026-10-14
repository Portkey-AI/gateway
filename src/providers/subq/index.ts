import { ProviderConfigs } from '../types';
import { subqAPIConfig } from './api';

export const subqProviderAPIConfig: ProviderConfigs = {
  api: subqAPIConfig,
  chatComplete: {
    model: {
      param: 'model',
      required: true,
      default: 'subq-latest',
    },
    messages: {
      param: 'state',
      transform: (params: any) => {
        let state = 'Context Evaluation';
        let prompt = 'Evaluate criteria probabilities.';
        if (Array.isArray(params.messages)) {
          for (const msg of params.messages) {
            if (msg.role === 'system') state = msg.content;
            if (msg.role === 'user') prompt = msg.content;
          }
        }
        return state;
      },
    },
  },
};
