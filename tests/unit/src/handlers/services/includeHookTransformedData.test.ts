import { Context } from 'hono';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';
import { HooksService } from '../../../../../src/handlers/services/hooksService';
import { Options } from '../../../../../src/types/requestBody';
import { endpointStrings } from '../../../../../src/providers/types';

jest.mock('../../../../../src/services/transformToProviderRequest', () => ({
  transformToProviderRequest: jest.fn(),
}));

jest.mock('../../../../../src/middlewares/hooks', () => ({
  HooksManager: jest.fn(),
  HookSpan: jest.fn(),
}));

describe('includeHookTransformedData request option', () => {
  const createSpan = jest.fn().mockReturnValue({ id: 'span' });
  const honoContext = {
    get: jest.fn().mockReturnValue({ createSpan }),
    set: jest.fn(),
  } as unknown as Context;

  const createContext = (includeHookTransformedData?: boolean) =>
    new RequestContext(
      honoContext,
      {
        provider: 'openai',
        includeHookTransformedData,
      } as Options,
      'chatComplete' as endpointStrings,
      {},
      { model: 'gpt-4', messages: [] },
      'POST',
      0
    );

  beforeEach(() => {
    createSpan.mockClear();
  });

  it('is false unless the provider option is exactly true', () => {
    expect(createContext().includeHookTransformedData).toBe(false);
    expect(createContext(false).includeHookTransformedData).toBe(false);
    expect(createContext(true).includeHookTransformedData).toBe(true);
  });

  it('forwards a true opt-in into the hook span and omits it otherwise', () => {
    new HooksService(createContext(true));
    expect(createSpan).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'gpt-4' }),
      {},
      'openai',
      false,
      [],
      [],
      null,
      'chatComplete',
      {},
      true
    );

    new HooksService(createContext(false));
    expect(createSpan).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      'openai',
      false,
      [],
      [],
      null,
      'chatComplete',
      {},
      false
    );
  });
});
