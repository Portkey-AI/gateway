import { env } from 'hono/adapter';
import { ProviderAPIConfig } from '../types';
import { HEADER_KEYS } from '../../globals';
import { PORTKEY_HEADER_KEYS } from './constants';

const PortkeyAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ fn, c }) => {
    if (!c) return '';
    switch (fn) {
      case 'uploadFile':
        return `${env(c).DATASERVICE_BASEPATH}/v1`;
      case 'retrieveFile':
        return `${env(c).ALBUS_BASEPATH}/v2`;
      case 'listFiles':
        return `${env(c).ALBUS_BASEPATH}/v2`;
      case 'deleteFile':
        return `${env(c).ALBUS_BASEPATH}/v2`;
      case 'retrieveFileContent':
        return `${env(c).DATASERVICE_BASEPATH}/v1`;
      case 'createBatch':
        return `${env(c).DATASERVICE_BASEPATH}/v1`;
      case 'retrieveBatch':
        return `${env(c).ALBUS_BASEPATH}/v2`;
      case 'getBatchOutput':
        return `${env(c).DATASERVICE_BASEPATH}/v1`;
      case 'cancelBatch':
        return `${env(c).DATASERVICE_BASEPATH}/v1`;
      case 'listBatches':
        return `${env(c).ALBUS_BASEPATH}/v2`;
      default:
        return `${env(c).ALBUS_BASEPATH}/v2`;
    }
  },
  headers: ({ c, fn }) => {
    const headers = Object.fromEntries(c.req.raw.headers);
    return {
      Authorization: env(c).PORTKEY_CLIENT_AUTH,
      [PORTKEY_HEADER_KEYS.API_KEY]: headers[PORTKEY_HEADER_KEYS.API_KEY],
      ...(headers[PORTKEY_HEADER_KEYS.CONFIG] && {
        [PORTKEY_HEADER_KEYS.CONFIG]: headers[PORTKEY_HEADER_KEYS.CONFIG],
      }),
      ...(headers[PORTKEY_HEADER_KEYS.VIRTUAL_KEY] && {
        [PORTKEY_HEADER_KEYS.VIRTUAL_KEY]:
          headers[PORTKEY_HEADER_KEYS.VIRTUAL_KEY],
      }),
      ...(fn === 'uploadFile' && {
        'Content-Type': headers['content-type'],
      }),
    };
  },
  getEndpoint: ({ c, fn, gatewayRequestURL }) => {
    const organisationDetails = JSON.parse(
      c.get('headersObj')[HEADER_KEYS.ORGANISATION_DETAILS]
    );
    const [basePath, query] = gatewayRequestURL
      .split('/v1')?.[1]
      ?.split('?') || ['', ''];
    const queryParams = query
      ? `?${query}&organisation_id=${organisationDetails.id}`
      : `?organisation_id=${organisationDetails.id}`;
    switch (fn) {
      case 'uploadFile':
        return `${basePath}${queryParams}&content_length=${c.req.raw.headers.get('content-length')}`;
      case 'retrieveFile':
        return `${basePath}${queryParams}`;
      case 'listFiles':
        return `${basePath}${queryParams}`;
      case 'deleteFile':
        return `${basePath}${queryParams}`;
      case 'retrieveFileContent':
        return `${basePath}${queryParams}`;
      case 'createBatch':
        return `${basePath}${queryParams}`;
      case 'retrieveBatch':
        return `${basePath}${queryParams}`;
      case 'cancelBatch':
        return `${basePath}${queryParams}`;
      case 'listBatches':
        return `${basePath}${queryParams}`;
      case 'getBatchOutput':
        return `${basePath}${queryParams}`;
      default:
        return '';
    }
  },
};

export default PortkeyAPIConfig;
