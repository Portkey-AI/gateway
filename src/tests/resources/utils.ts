import { OracleConfig } from './testVariables';

export const createDefaultHeaders = (
  provider: string,
  authorization: string
) => {
  return {
    'x-portkey-provider': provider,
    Authorization: authorization,
    'Content-Type': 'application/json',
  };
};

export const createOracleHeaders = (oracleConfig: OracleConfig) => {
  return {
    'x-portkey-provider': 'oracle',
    'Content-Type': 'application/json',
    'x-portkey-oracle-tenancy': oracleConfig.tenancy,
    'x-portkey-oracle-user': oracleConfig.user,
    'x-portkey-oracle-fingerprint': oracleConfig.fingerprint,
    'x-portkey-oracle-private-key': oracleConfig.privateKey,
    'x-portkey-oracle-region': oracleConfig.region,
    'x-portkey-oracle-compartment-id': oracleConfig.compartmentId,
    ...(oracleConfig.servingMode && {
      'x-portkey-oracle-serving-mode': oracleConfig.servingMode,
    }),
  };
};
