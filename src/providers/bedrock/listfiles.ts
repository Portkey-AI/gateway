import { GatewayError } from '../../errors/GatewayError';
import { ErrorResponse } from '../types';

export const BedrockListFilesResponseTransform = ():
  | Response
  | ErrorResponse => {
  throw new GatewayError(`listFiles is not supported by Bedrock`);
};
