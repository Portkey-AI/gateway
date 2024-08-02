import { Params } from '../../types/requestBody';

const CHAT_COMPLETE_WITH_MESSAGE_CONTENT_ARRAYS_REQUEST: Params = {
  model: 'MODEL_PLACE_HOLDER',
  max_tokens: 200,
  temperature: -120,
  stream: false,
  messages: [
    {
      role: 'system',
      content: [
        {
          type: 'text',
          text: 'You are Batman',
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Who is the greatest detective',
        },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'is it me?',
        },
      ],
    },
  ],
};

export const getChatCompleteWithMessageContentArraysRequest = (
  model: string
) => {
  return JSON.stringify({
    ...CHAT_COMPLETE_WITH_MESSAGE_CONTENT_ARRAYS_REQUEST,
    model,
  });
};

export const CHAT_COMPLETE_WITH_MESSAGE_STRING_REQUEST: Params = {
  model: 'j2-ultra',
  max_tokens: 200,
  stream: false,
  messages: [
    {
      role: 'system',
      content: 'You are batman',
    },
    {
      role: 'user',
      content: "Who's the worlds greatest detective?",
    },
  ],
};
