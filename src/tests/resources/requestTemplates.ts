import { Params } from '../../types/requestBody';

const CHAT_COMPLETE_WITH_MESSAGE_CONTENT_ARRAYS_REQUEST: Params = {
  model: 'MODEL_PLACE_HOLDER',
  max_tokens: 20,
  stream: false,
  messages: [
    {
      role: 'system',
      content: 'You are the half-blood prince',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Can you teach me a useful spell?',
        },
      ],
    },
  ],
};

export const getChatCompleteWithMessageContentArraysRequest = (
  model?: string
) => {
  return JSON.stringify({
    ...CHAT_COMPLETE_WITH_MESSAGE_CONTENT_ARRAYS_REQUEST,
    model,
  });
};

export const CHAT_COMPLETE_WITH_MESSAGE_STRING_REQUEST: Params = {
  model: 'MODEL_PLACEHOLDER',
  max_tokens: 20,
  stream: false,
  messages: [
    {
      role: 'system',
      content: 'You are the half-blood prince',
    },
    {
      role: 'user',
      content: 'Can you teach me a useful spell?',
    },
  ],
};

export const getChatCompleteWithMessageStringRequest = (model?: string) => {
  return JSON.stringify({
    ...CHAT_COMPLETE_WITH_MESSAGE_STRING_REQUEST,
    model,
  });
};

// Rerank request templates
const RERANK_STRING_DOCUMENTS = [
  'Machine learning is a subset of artificial intelligence that enables systems to learn from data.',
  'Deep learning uses neural networks with many layers to process complex patterns.',
  'Natural language processing helps computers understand human language.',
  'Computer vision allows machines to interpret and analyze visual information.',
];

const RERANK_OBJECT_DOCUMENTS = RERANK_STRING_DOCUMENTS.map((text) => ({
  text,
}));

interface RerankOptions {
  top_n?: number;
  return_documents?: boolean;
  max_chunks_per_doc?: number;
}

export const getRerankRequest = (
  model: string,
  documentType: 'string' | 'object' = 'string',
  options: RerankOptions = {}
) => {
  const documents =
    documentType === 'string'
      ? RERANK_STRING_DOCUMENTS
      : RERANK_OBJECT_DOCUMENTS;

  return JSON.stringify({
    model,
    query: 'What is machine learning?',
    documents,
    ...options,
  });
};
