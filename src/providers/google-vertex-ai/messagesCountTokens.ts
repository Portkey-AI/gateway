import { MessageCreateParamsBase } from '../../types/MessagesRequest';
import { getMessagesConfig } from '../anthropic-base/messages';

export const VertexAnthropicMessagesCountTokensConfig = {
  ...getMessagesConfig({}),
  model: {
    param: 'model',
    required: true,
    transform: (params: MessageCreateParamsBase) => {
      let model = params.model ?? '';
      return model.replace('anthropic.', '');
    },
  },
};
