import { GatewayError } from '../../errors/GatewayError';
import { ErrorResponse } from '../types';

export const BedrockDeleteFileResponseTransform = ():
  | Response
  | ErrorResponse => {
  throw new GatewayError(`deleteFile is not supported by Bedrock`);
};
