import { OpenAIMessageRole } from '../../types/requestBody';
import { OracleMessageRole } from './types/ChatDetails';

export const openAIToOracleRoleMap: Record<
  OpenAIMessageRole,
  OracleMessageRole
> = {
  system: 'SYSTEM',
  user: 'USER',
  assistant: 'ASSISTANT',
  developer: 'SYSTEM',
  tool: 'TOOL',
  function: 'TOOL',
};

export const oracleToOpenAIRoleMap: Record<
  OracleMessageRole,
  OpenAIMessageRole
> = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  DEVELOPER: 'developer',
  TOOL: 'tool',
};
