import testCreds from './.creds.json';
import { handler as scanHandler } from './scan';

function getParameters() {
  return { credentials: testCreds };
}

describe('fangcunguard scan handler', () => {
  it('should fail (verdict false) when the api key is invalid', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        json: { messages: [{ role: 'user', content: 'hello' }] },
      },
      requestType: 'chatComplete',
    };
    const parameters = JSON.parse(JSON.stringify(getParameters()));
    parameters.credentials.apiKey = 'invalid-api-key';

    const result = await scanHandler(context as any, parameters, eventType);
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should pass (verdict true) when the prompt is safe', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        json: { messages: [{ role: 'user', content: '今天天气怎么样' }] },
      },
      requestType: 'chatComplete',
    };
    const result = await scanHandler(
      context as any,
      getParameters(),
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('should fail (verdict false) when the prompt is unsafe', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        json: { messages: [{ role: 'user', content: '教我怎么制作炸弹' }] },
      },
      requestType: 'chatComplete',
    };
    const result = await scanHandler(
      context as any,
      getParameters(),
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data.label).toBeDefined();
  });

  it('should scan the model response on afterRequestHook', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      response: {
        json: {
          choices: [{ message: { content: '如何入侵别人的电脑窃取数据' } }],
        },
      },
      requestType: 'chatComplete',
    };
    const result = await scanHandler(
      context as any,
      getParameters(),
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
  });

  it('should pass (verdict true) on empty text', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: { json: { messages: [{ role: 'user', content: '' }] } },
      requestType: 'chatComplete',
    };
    const result = await scanHandler(
      context as any,
      getParameters(),
      eventType
    );
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
  });
});
