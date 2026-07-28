import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
  //HandlerOptions
} from '../types';
import { APIAccess } from './impl';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let errors = [];
  let logMsg = [];
  let data = null;

  try {
    let api;
    if (
      context.credentials &&
      context.credentials.apiKey &&
      context.credentials.apiCredential
    ) {
      api = new APIAccess(
        context.credentials.apiKey,
        context.credentials.apiCredential
      );
    } else if (
      parameters &&
      parameters.credentials &&
      parameters.credentials.apiKey &&
      parameters.credentials.apiCredential
    ) {
      api = new APIAccess(
        parameters.credentials.apiKey,
        parameters.credentials.apiCredential
      );
    } else {
      api = null;
      errors.push(
        'Please provide your Cryptowerk API key and credential (e.g. in before/afterRequestHooks/checks/parameters).'
      );
      //throw new Error(...)
    }

    if (api != null) {
      let docToSealJson = {
        eventType: eventType,
        request: context.request.json,
        response:
          context.response && context.response.json
            ? context.response.json
            : null,
      };
      let docToSealText = JSON.stringify(docToSealJson);
      let docToSealBin = Buffer.from(docToSealText);
      let docToSeal64 = docToSealBin.toString('base64');
      let response = await api.register(docToSealBin);
      if (!('apiResult' in response))
        errors.push(
          'Missing API result. Possibly the connection to the API server failed.'
        );
      else if (!('documents' in response.apiResult))
        errors.push('Missing documents in API result.');
      else {
        let retrievalId = response.apiResult.documents[0].retrievalId;
        let docHash = response.docHash;
        logMsg.push(
          //'Sealed text=' + docToSealText /*+" base64="+docToSeal64*/ +
          'Proof created: docHash=' +
            docHash +
            ' retrievalId=' +
            retrievalId +
            ' verifiable at https://developers.cryptowerk.com/platform/permalink/sealapiverify?retrievalId=' +
            retrievalId
        );
        data = {
          // any additional data you want to return
          sealedData: docToSealText,
          sealedDataBase64: docToSeal64,
          docHash: docHash,
          retrievalId: retrievalId,
        };
      }
    }
  } catch (e: any) {
    let msg;
    if (e instanceof Error) msg = e.message;
    else msg = e.toString();
    errors.push(msg);
  }
  const error = errors.length > 0 ? new Error(errors.join(' ')) : null;
  return {
    error: error, // error object if an error occurred
    verdict: errors.length == 0, // indicate if the guardrail passed or failed
    data: data,
    log: logMsg.join(' '),
  };
};
