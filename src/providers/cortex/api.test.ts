import { Options } from '../../types/requestBody';
import { GatewayError } from '../../errors/GatewayError';
import CortexAPIConfig from './api';

type BaseURLArgs = Parameters<typeof CortexAPIConfig.getBaseURL>[0];

const callGetBaseURL = (providerOptions: Record<string, any>): string =>
  CortexAPIConfig.getBaseURL({
    providerOptions: providerOptions as Options,
  } as unknown as BaseURLArgs) as string;

describe('Cortex getBaseURL', () => {
  it('builds the Snowflake hostname from a valid account identifier', () => {
    expect(callGetBaseURL({ snowflakeAccount: 'myorg-myaccount' })).toBe(
      'https://myorg-myaccount.snowflakecomputing.com/api/v2'
    );
  });

  it('accepts legacy dotted account identifiers', () => {
    expect(callGetBaseURL({ snowflakeAccount: 'xy12345.us-east-1.aws' })).toBe(
      'https://xy12345.us-east-1.aws.snowflakecomputing.com/api/v2'
    );
  });

  describe('SSRF prevention', () => {
    it('rejects snowflakeAccount containing # (hostname hijacking)', () => {
      expect(() => callGetBaseURL({ snowflakeAccount: 'evil.com#' })).toThrow(
        GatewayError
      );
    });

    it('rejects snowflakeAccount containing /', () => {
      expect(() => callGetBaseURL({ snowflakeAccount: 'evil.com/' })).toThrow(
        GatewayError
      );
    });

    it('rejects snowflakeAccount containing @', () => {
      expect(() =>
        callGetBaseURL({ snowflakeAccount: 'user@evil.com' })
      ).toThrow(GatewayError);
    });
  });
});
