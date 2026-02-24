import { env } from 'hono/adapter';
import { ProviderAPIConfig } from '../types';
import { PORTKEY_HEADER_KEYS } from '../../middlewares/portkey/globals';
import {
  getContext,
  ContextKeys,
} from '../../middlewares/portkey/contextHelpers';
import { Environment } from '../../utils/env';
import { getInternalHttpsNodeFetchAgent } from '../../agentStore';

const PortkeyAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ fn, c }) => {
    if (!c) return '';
    switch (fn) {
      case 'uploadFile':
        return `${Environment(env(c)).DATASERVICE_BASEPATH}/v1`;
      case 'retrieveFile':
        return `${Environment(env(c)).ALBUS_BASEPATH}/v2`;
      case 'listFiles':
        return `${Environment(env(c)).ALBUS_BASEPATH}/v2`;
      case 'deleteFile':
        return `${Environment(env(c)).ALBUS_BASEPATH}/v2`;
      case 'retrieveFileContent':
        return `${Environment(env(c)).DATASERVICE_BASEPATH}/v1`;
      case 'createBatch':
        return `${Environment(env(c)).DATASERVICE_BASEPATH}/v1`;
      case 'retrieveBatch':
        return `${Environment(env(c)).ALBUS_BASEPATH}/v2`;
      case 'getBatchOutput':
        return `${Environment(env(c)).DATASERVICE_BASEPATH}/v1`;
      case 'cancelBatch':
        return `${Environment(env(c)).DATASERVICE_BASEPATH}/v1`;
      case 'listBatches':
        return `${Environment(env(c)).ALBUS_BASEPATH}/v2`;
      case 'listFinetunes':
        return `${Environment(env(c)).ALBUS_BASEPATH}/v2`;
      case 'createFinetune':
        return `${Environment(env(c)).DATASERVICE_BASEPATH}/v1`;
      case 'retrieveFinetune':
        return `${Environment(env(c)).ALBUS_BASEPATH}/v2`;
      case 'cancelFinetune':
        return `${Environment(env(c)).DATASERVICE_BASEPATH}/v1`;
      default:
        return `${Environment(env(c)).ALBUS_BASEPATH}/v2`;
    }
  },
  headers: ({ c, fn }) => {
    const headers = Object.fromEntries(c.req.raw.headers);
    return {
      Authorization: Environment(env(c)).PORTKEY_CLIENT_AUTH,
      [PORTKEY_HEADER_KEYS.API_KEY]: headers[PORTKEY_HEADER_KEYS.API_KEY],
      ...(headers[PORTKEY_HEADER_KEYS.CONFIG] && {
        [PORTKEY_HEADER_KEYS.CONFIG]: headers[PORTKEY_HEADER_KEYS.CONFIG],
      }),
      ...(headers[PORTKEY_HEADER_KEYS.VIRTUAL_KEY] && {
        [PORTKEY_HEADER_KEYS.VIRTUAL_KEY]:
          headers[PORTKEY_HEADER_KEYS.VIRTUAL_KEY],
      }),
      'use-node-fetch': true,
      ...(fn === 'uploadFile' && {
        'Content-Type': headers['content-type'],
      }),
    };
  },
  getEndpoint: ({ c, fn, gatewayRequestURL }) => {
    const organisationDetails = getContext(
      c,
      ContextKeys.ORGANISATION_DETAILS
    )!;
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
      case 'listFinetunes':
        return `${basePath}${queryParams}`;
      case 'createFinetune':
        return `${basePath}${queryParams}`;
      case 'retrieveFinetune':
        return `${basePath}${queryParams}`;
      case 'cancelFinetune':
        return `${basePath}${queryParams}`;
      default:
        return '';
    }
  },
  getOptions: () => {
    return {
      agent: getInternalHttpsNodeFetchAgent(),
    } as RequestInit;
  },
};

export default PortkeyAPIConfig;
