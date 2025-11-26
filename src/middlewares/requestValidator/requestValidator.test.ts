import { Context } from 'hono';
import { requestValidator } from './index';
import { PortkeyError } from '../../errors/PortkeyError';
import { ERROR_CODES } from '../../errors/errorConstants';

// Mock env.ts to avoid top-level await issues
jest.mock('../../utils/env', () => ({
  Environment: jest.fn(() => ({
    TRUSTED_CUSTOM_HOSTS: new Set(['localhost']),
  })),
}));

describe('requestValidator', () => {
  let mockContext: Partial<Context>;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    mockContext = {
      req: {
        raw: {
          headers: new Headers(),
        },
      } as any,
    };
  });

  it('should throw INVALID_CONTENT_TYPE for invalid content type', () => {
    mockContext.req!.raw.headers.set('content-type', 'text/plain');

    expect(() => requestValidator(mockContext as Context, next)).toThrow(
      PortkeyError
    );
    try {
      requestValidator(mockContext as Context, next);
    } catch (e: any) {
      expect(e.code).toBe(ERROR_CODES.INVALID_CONTENT_TYPE);
      expect(e.status).toBe(400);
    }
  });

  it('should throw MISSING_REQUIRED_HEADER if no provider or config header', () => {
    mockContext.req!.raw.headers.set('content-type', 'application/json');

    expect(() => requestValidator(mockContext as Context, next)).toThrow(
      PortkeyError
    );
    try {
      requestValidator(mockContext as Context, next);
    } catch (e: any) {
      expect(e.code).toBe(ERROR_CODES.MISSING_REQUIRED_HEADER);
      expect(e.status).toBe(400);
    }
  });

  it('should throw INVALID_PROVIDER for invalid provider', () => {
    mockContext.req!.raw.headers.set('content-type', 'application/json');
    mockContext.req!.raw.headers.set('x-portkey-provider', 'invalid-provider');

    expect(() => requestValidator(mockContext as Context, next)).toThrow(
      PortkeyError
    );
    try {
      requestValidator(mockContext as Context, next);
    } catch (e: any) {
      expect(e.code).toBe(ERROR_CODES.INVALID_PROVIDER);
      expect(e.status).toBe(400);
    }
  });

  it('should throw INVALID_CONFIG for invalid json config', () => {
    mockContext.req!.raw.headers.set('content-type', 'application/json');
    mockContext.req!.raw.headers.set('x-portkey-config', '{invalid-json');

    expect(() => requestValidator(mockContext as Context, next)).toThrow(
      PortkeyError
    );
    try {
      requestValidator(mockContext as Context, next);
    } catch (e: any) {
      expect(e.code).toBe(ERROR_CODES.INVALID_CONFIG);
      expect(e.status).toBe(400);
    }
  });

  it('should call next() for valid request', () => {
    mockContext.req!.raw.headers.set('content-type', 'application/json');
    mockContext.req!.raw.headers.set('x-portkey-provider', 'openai');

    requestValidator(mockContext as Context, next);
    expect(next).toHaveBeenCalled();
  });
});
