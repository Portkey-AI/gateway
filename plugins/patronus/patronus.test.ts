import testCreds from './.creds.json';
import { handler as phiHandler } from './phi';
import { handler as piiHandler } from './pii';
import { handler as toxicityHandler } from './toxicity';
import { handler as retrievalAnswerRelevanceHandler } from './retrievalAnswerRelevance';
import { handler as customHandler } from './custom';
import { PluginContext } from '../types';

describe('phi handler', () => {
  it('should pass when text is clean', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'this is a test string for moderations',
        json: {
          messages: [
            {
              role: 'user',
              content: 'this is a test string for moderations',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = { credentials: testCreds };

    const result = await phiHandler(
      context as PluginContext,
      parameters,
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.transformed).toBe(false);
  });

  it('should fail when text contains PHI', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'John Doe has a history of heart disease',
        json: {
          messages: [
            {
              role: 'user',
              content: 'John Doe has a history of heart disease',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = { credentials: testCreds };

    const result = await phiHandler(
      context as PluginContext,
      parameters,
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.transformedData?.response?.json).toBeNull();
    expect(result.transformedData?.request?.json).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should detect and redact PII in request text', async () => {
    const context = {
      request: {
        text: 'John Doe has a history of heart disease',
        json: {
          messages: [
            {
              role: 'user',
              content: 'John Doe has a history of heart disease',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      redact: true,
      credentials: testCreds,
    };

    const result = await phiHandler(
      context as PluginContext,
      parameters,
      'beforeRequestHook',
      {
        env: {},
      }
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.transformedData?.request?.json?.messages?.[0]?.content).toBe(
      'J******e has a history of heart disease'
    );
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in request text with multiple content parts', async () => {
    const context = {
      request: {
        text: 'John Doe has a history of heart disease John Doe has a history of heart disease and some random text',
        json: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'John Doe has a history of heart disease',
                },
                {
                  type: 'text',
                  text: 'John Doe has a history of heart disease and some random text',
                },
              ],
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      redact: true,
      credentials: testCreds,
    };

    const result = await phiHandler(
      context as PluginContext,
      parameters,
      'beforeRequestHook',
      {
        env: {},
      }
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined;
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[0]?.text
    ).toBe('J******e has a history of heart disease');
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[1]?.text
    ).toBe('J******e has a history of heart disease and some random text');
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PHI in response text', async () => {
    const context = {
      response: {
        text: 'John Doe has a history of heart disease and some random text',
        json: {
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'John Doe has a history of heart disease and some random text',
              },
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      redact: true,
      credentials: testCreds,
    };

    const result = await phiHandler(
      context as PluginContext,
      parameters,
      'afterRequestHook',
      {
        env: {},
      }
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(
      result.transformedData?.response?.json?.choices?.[0]?.message?.content
    ).toBe('J******e has a history of heart disease and some random text');
    expect(result.transformed).toBe(true);
  });
});

describe('pii handler', () => {
  it('should pass when text is clean', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'this is a test string for moderations',
        json: {
          messages: [
            {
              role: 'user',
              content: 'this is a test string for moderations',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = { credentials: testCreds };

    const result = await piiHandler(
      context as PluginContext,
      parameters,
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.transformed).toBe(false);
  });

  it('should fail when text contains PII', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: {
        text: 'My email is abc@xyz.com and some random text',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My email is abc@xyz.com and some random text',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const parameters = { credentials: testCreds };

    const result = await piiHandler(
      context as PluginContext,
      parameters,
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.transformedData?.response?.json).toBeNull();
    expect(result.transformedData?.request?.json).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should detect and redact PII in request text', async () => {
    const context = {
      request: {
        text: 'My email is abc@xyz.com and some random text',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My email is abc@xyz.com and some random text',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      redact: true,
      credentials: testCreds,
    };

    const result = await piiHandler(
      context as PluginContext,
      parameters,
      'beforeRequestHook',
      {
        env: {},
      }
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.transformedData?.request?.json?.messages?.[0]?.content).toBe(
      'My email is a*********m and some random text'
    );
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in request text with multiple content parts', async () => {
    const context = {
      request: {
        text: 'My email is abc@xyz.com My email is abc@xyz.com and some random text',
        json: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'My email is abc@xyz.com',
                },
                {
                  type: 'text',
                  text: 'My email is abc@xyz.com and some random text',
                },
              ],
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      redact: true,
      credentials: testCreds,
    };

    const result = await piiHandler(
      context as PluginContext,
      parameters,
      'beforeRequestHook',
      {
        env: {},
      }
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined;
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[0]?.text
    ).toBe('My email is a*********m');
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[1]?.text
    ).toBe('My email is a*********m and some random text');
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in response text', async () => {
    const context = {
      response: {
        text: 'My email is abc@xyz.com and some random text',
        json: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'My email is abc@xyz.com and some random text',
              },
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      redact: true,
      credentials: testCreds,
    };

    const result = await piiHandler(
      context as PluginContext,
      parameters,
      'afterRequestHook',
      {
        env: {},
      }
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(
      result.transformedData?.response?.json?.choices?.[0]?.message?.content
    ).toBe('My email is a*********m and some random text');
    expect(result.transformed).toBe(true);
  });
});

describe('toxicity handler', () => {
  it('should fail if beforeRequestHook is used', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: { text: 'this is a test string for moderations' },
    };
    const parameters = { credentials: testCreds };

    const result = await toxicityHandler(context, parameters, eventType);
    expect(result).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
  });

  it('should pass when text is clean', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      request: { text: 'this is a test string for moderations' },
      response: { text: 'this is a test string for moderations' },
    };

    const parameters = { credentials: testCreds };

    const result = await toxicityHandler(context, parameters, eventType);
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('should fail when text is toxic', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      request: { text: `You stinking, lazy ` },
      response: { text: `piece of shit! Who do you think you are?` },
    };

    const parameters = { credentials: testCreds };

    const result = await toxicityHandler(context, parameters, eventType);
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });
});

describe('retrieval answer relevance handler', () => {
  it('should fail if beforeRequestHook is used', async () => {
    const eventType = 'beforeRequestHook';
    const context = {
      request: { text: 'this is a test string for moderations' },
    };
    const parameters = { credentials: testCreds };

    const result = await retrievalAnswerRelevanceHandler(
      context,
      parameters,
      eventType
    );
    expect(result).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
  });

  it('should pass when answer is relevant to the question', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      request: { text: 'What is one of the biggest benefits of Gen AI?' },
      response: {
        text: `Gen AI will free up humanity's time so that we humans can focus on more purposeful ideals.`,
      },
    };

    const parameters = { credentials: testCreds };

    const result = await retrievalAnswerRelevanceHandler(
      context,
      parameters,
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  }, 10000);

  it('should fail when answer is irrelevant', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      request: { text: `What is one of the biggest benefits of Gen AI?` },
      response: { text: `Betty bought a bit of butter` },
    };

    const parameters = { credentials: testCreds };

    const result = await retrievalAnswerRelevanceHandler(
      context,
      parameters,
      eventType
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  }, 10000);
});

describe('custom handler (is-concise)', () => {
  it('should pass when answer is concise', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      request: { text: 'Tell me a bit more about Company A.' },
      response: {
        text: `Company A builds the leading platform for database management software, called A-DB.`,
      },
    };

    const parameters = {
      credentials: testCreds,
      criteria: 'patronus:is-concise',
    };

    const result = await customHandler(context, parameters, eventType);
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  }, 10000);

  it('should fail when answer is lengthy', async () => {
    const eventType = 'afterRequestHook';
    const context = {
      request: { text: `What is one of the biggest benefits of Gen AI?` },
      response: {
        text: `Company A builds the leading platform for database management software, called A-DB. Company A has won many awards for their innovative work here, including the '2023 Innovative Company of the year' award for their groundbreaking features. Sign up to get access to A-DB, and accelerate your engineering teams today!`,
      },
    };

    const parameters = {
      credentials: testCreds,
      criteria: 'patronus:is-concise',
    };

    const result = await customHandler(context, parameters, eventType);
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  }, 10000);
});
