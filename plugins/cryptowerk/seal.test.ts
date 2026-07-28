import { handler } from './seal';
import {
  HookEventType,
  PluginContext,
  PluginParameters,
  PluginHandler,
  PluginHandlerResponse,
} from '../types';
import { APIAccess } from './impl';

describe('Cryptowerk Plugin', () => {
  const apiKey = 'K3MiuGZCcDsmYp6io/tBuX6VabGK3O3SVMe8mZlQF68='; // test credentials, committing them to git is intentional
  const apiCredential = 'idp3RCub/9zQVggIAMxeMxDtLZ09SogdTFHXrGAx084=';

  const context: PluginContext = {
    request: {
      //text: "This is an example request for which a verifiable proof will be created.",
      json: {
        messages: [
          {
            role: 'user',
            content:
              'This is an example request for which a verifiable proof will be created.',
          },
        ],
      },
    },
    credentials: {
      apiKey: apiKey,
      apiCredential: apiCredential,
    },
  };
  const parameters: PluginParameters = {};
  const eventType: HookEventType = 'afterRequestHook';

  it('should create a proof', async () => {
    const result = await handler(context, parameters, eventType);

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(
      result.data.sealedData.indexOf(
        context.request.json.messages[0].content
      ) >= 0
    ).toBe(true);
    expect(result.data.sealedDataBase64.length).toBeGreaterThan(
      result.data.sealedData.length
    );
    expect(result.data.docHash).toHaveLength((256 / 8) * 2);
    expect(result.data.retrievalId.startsWith('ri3')).toBe(true);

    //console.log("retrievalId="+result.data.retrievalId);
  });

  it('should retrieve a proof', async () => {
    let api = new APIAccess(apiKey, apiCredential);
    let retrievalId =
      'ri31907897c52999213379ced8e63f8e1bc94da484b45a5d175adfde2da2466fcc1';
    let response = await api.getSeal(retrievalId);
    //console.log(response);
    expect(response.documents).toHaveLength(1);
    let doc = response.documents[0];
    expect(doc.retrievalId).toEqual(retrievalId);
    expect(doc.submittedAt).toEqual(1782985598783);
  });

  it('should tell about wrong credentials', async () => {
    function wrongCred(
      manipulator: (context: PluginContext) => void
    ): Promise<PluginHandlerResponse> {
      let contextCopy = JSON.parse(JSON.stringify(context));
      manipulator(contextCopy);
      const response = handler(contextCopy, parameters, eventType);
      response.then((result) => {
        expect(result.error).toBeInstanceOf(Error);
      });
      return response;
    }

    {
      const result = await wrongCred((context) => {
        context.credentials.apiCredential += 'wrong';
      });
      expect(result.error.message).toContain(
        'Input byte array has incorrect ending byte'
      );
    }
    {
      const result = await wrongCred((context) => {
        context.credentials.apiCredential = 'abc';
      });
      expect(result.error.message).toContain('Credentials are invalid');
    }
    {
      const result = await wrongCred((context) => {
        context.credentials.apiKey = 'abc';
      });
      expect(result.error.message).toContain('Account does not exist');
    }
  });
});
