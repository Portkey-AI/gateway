import { parseTraceparent, parseBaggage, updateHeaders } from '../utils';
import { PORTKEY_HEADER_KEYS, EntityStatus } from '../globals';
import { OrganisationDetails } from '../types';

describe('parseTraceparent', () => {
  test('should parse valid traceparent header correctly', () => {
    const traceparent =
      '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00';
    const result = parseTraceparent(traceparent);
    expect(result).toEqual({
      traceId: 'bad90143930ea019df8f681254fb2393',
      parentSpanId: '42df8ac2dde4ac52',
    });
  });

  test('should handle traceparent with different trace flags', () => {
    const traceparent =
      '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const result = parseTraceparent(traceparent);
    expect(result).toEqual({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      parentSpanId: 'b7ad6b7169203331',
    });
  });

  test('should return null for invalid traceparent with wrong number of parts', () => {
    const traceparent = '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });

  test('should return null for traceparent with non-hex version', () => {
    const traceparent =
      'zz-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });

  test('should return null for traceparent with invalid trace-id length', () => {
    const traceparent =
      '00-bad90143930ea019df8f681254fb239-42df8ac2dde4ac52-00';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });

  test('should return null for traceparent with all-zero trace-id', () => {
    const traceparent =
      '00-00000000000000000000000000000000-42df8ac2dde4ac52-00';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });

  test('should return null for traceparent with invalid span-id length', () => {
    const traceparent =
      '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac5-00';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });

  test('should return null for traceparent with all-zero span-id', () => {
    const traceparent =
      '00-bad90143930ea019df8f681254fb2393-0000000000000000-00';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });

  test('should return null for traceparent with invalid trace-flags', () => {
    const traceparent =
      '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-zz';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });

  test('should return null for empty string', () => {
    const result = parseTraceparent('');
    expect(result).toBeNull();
  });

  test('should return null for null input', () => {
    const result = parseTraceparent(null as any);
    expect(result).toBeNull();
  });

  test('should return null for undefined input', () => {
    const result = parseTraceparent(undefined as any);
    expect(result).toBeNull();
  });

  test('should handle traceparent with extra whitespace', () => {
    const traceparent =
      '  00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00  ';
    const result = parseTraceparent(traceparent);
    expect(result).toEqual({
      traceId: 'bad90143930ea019df8f681254fb2393',
      parentSpanId: '42df8ac2dde4ac52',
    });
  });

  test('should be case insensitive for hex characters', () => {
    const traceparent =
      '00-BAD90143930EA019DF8F681254FB2393-42DF8AC2DDE4AC52-00';
    const result = parseTraceparent(traceparent);
    expect(result).toEqual({
      traceId: 'BAD90143930EA019DF8F681254FB2393',
      parentSpanId: '42DF8AC2DDE4AC52',
    });
  });

  test('should return null for non-hex characters in trace-id', () => {
    const traceparent =
      '00-zad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });

  test('should return null for non-hex characters in span-id', () => {
    const traceparent =
      '00-bad90143930ea019df8f681254fb2393-z2df8ac2dde4ac52-00';
    const result = parseTraceparent(traceparent);
    expect(result).toBeNull();
  });
});

describe('parseBaggage', () => {
  test('should parse valid baggage header correctly', () => {
    const baggage = 'userId=alice,serverNode=DF:28,isProduction=false';
    const result = parseBaggage(baggage);
    expect(result).toEqual({
      userId: 'alice',
      serverNode: 'DF:28',
      isProduction: 'false',
    });
  });

  test('should handle baggage with properties', () => {
    const baggage = 'userId=alice;property1;property2,serverNode=DF:28';
    const result = parseBaggage(baggage);
    expect(result).toEqual({
      userId: 'alice',
      serverNode: 'DF:28',
    });
  });

  test('should handle URL encoded values', () => {
    const baggage = 'key=value%20with%20spaces,another=test%3Dvalue';
    const result = parseBaggage(baggage);
    expect(result).toEqual({
      key: 'value with spaces',
      another: 'test=value',
    });
  });

  test('should handle empty baggage', () => {
    const result = parseBaggage('');
    expect(result).toEqual({});
  });

  test('should handle null input', () => {
    const result = parseBaggage(null as any);
    expect(result).toEqual({});
  });

  test('should handle undefined input', () => {
    const result = parseBaggage(undefined as any);
    expect(result).toEqual({});
  });

  test('should skip invalid entries', () => {
    const baggage = 'validKey=validValue,invalidEntry,anotherKey=anotherValue';
    const result = parseBaggage(baggage);
    expect(result).toEqual({
      validKey: 'validValue',
      anotherKey: 'anotherValue',
    });
  });

  test('should handle baggage with whitespace', () => {
    const baggage = ' userId = alice , serverNode = DF:28 ';
    const result = parseBaggage(baggage);
    expect(result).toEqual({
      userId: 'alice',
      serverNode: 'DF:28',
    });
  });

  test('should handle single baggage item', () => {
    const baggage = 'userId=alice';
    const result = parseBaggage(baggage);
    expect(result).toEqual({
      userId: 'alice',
    });
  });
});

describe('updateHeaders with OpenTelemetry headers', () => {
  const mockOrgDetails: OrganisationDetails = {
    id: 'org-123',
    ownerId: 'owner-123',
    name: 'Test Org',
    settings: {},
    isFirstGenerationDone: true,
    enterpriseSettings: {},
    workspaceDetails: {
      id: 'workspace-123',
      slug: 'test-workspace',
      defaults: {},
      usage_limits: [],
      rate_limits: [],
      status: EntityStatus.ACTIVE,
      policies: {
        usage_limits: [],
        rate_limits: [],
      },
    },
    scopes: [],
    defaults: {},
    usageLimits: [],
    rateLimits: [],
    status: EntityStatus.ACTIVE,
    apiKeyDetails: {
      id: 'key-123',
      key: 'test-key',
      isJwt: false,
      scopes: [],
      defaults: {},
      expiresAt: undefined,
      usageLimits: [],
      rateLimits: [],
      status: EntityStatus.ACTIVE,
      userId: undefined,
      systemDefaults: {},
    },
    organisationDefaults: {},
  };

  test('should populate trace-id, parent-span-id, and generate new span-id from traceparent when not present', () => {
    const headersObj: Record<string, string> = {
      traceparent: '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00',
    };

    updateHeaders(headersObj, mockOrgDetails);

    // trace-id should be extracted from traceparent
    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBe(
      'bad90143930ea019df8f681254fb2393'
    );
    // parent-span-id should be the parent-id from traceparent (the caller's span)
    expect(headersObj[PORTKEY_HEADER_KEYS.PARENT_SPAN_ID]).toBe(
      '42df8ac2dde4ac52'
    );
    // span-id should be a newly generated 16-char hex string (not from traceparent)
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toBeDefined();
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toHaveLength(16);
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toMatch(/^[0-9a-f]{16}$/);
    // Should NOT be the parent-id from traceparent
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).not.toBe(
      '42df8ac2dde4ac52'
    );
  });

  test('should not override existing headers when present', () => {
    const headersObj: Record<string, string> = {
      [PORTKEY_HEADER_KEYS.TRACE_ID]: 'existing-trace-id',
      [PORTKEY_HEADER_KEYS.SPAN_ID]: 'existingspanid1',
      [PORTKEY_HEADER_KEYS.PARENT_SPAN_ID]: 'existingparent1',
      traceparent: '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00',
    };

    updateHeaders(headersObj, mockOrgDetails);

    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBe('existing-trace-id');
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toBe('existingspanid1');
    expect(headersObj[PORTKEY_HEADER_KEYS.PARENT_SPAN_ID]).toBe(
      'existingparent1'
    );
  });

  test('should generate trace-id when traceparent is invalid for non-logger endpoints', () => {
    const headersObj: Record<string, string> = {
      traceparent: 'invalid-traceparent',
    };

    updateHeaders(headersObj, mockOrgDetails, '/v1/chat/completions');

    // Should generate a random UUID when traceparent is invalid for non-logger endpoints
    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBeDefined();
    expect(typeof headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBe('string');
  });

  test('should generate trace-id when traceparent is not present for non-logger endpoints', () => {
    const headersObj: Record<string, string> = {};

    updateHeaders(headersObj, mockOrgDetails, '/v1/chat/completions');

    // Should generate a random UUID when no traceparent for non-logger endpoints
    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBeDefined();
    expect(typeof headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBe('string');
  });

  test('should work with other header updates', () => {
    const headersObj: Record<string, string> = {
      traceparent: '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00',
    };

    const orgDetailsWithDefaults: OrganisationDetails = {
      ...mockOrgDetails,
      defaults: {
        config_slug: 'default-config',
      },
    };

    updateHeaders(headersObj, orgDetailsWithDefaults);

    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBe(
      'bad90143930ea019df8f681254fb2393'
    );
    expect(headersObj[PORTKEY_HEADER_KEYS.CONFIG]).toBe('default-config');
  });

  test('should populate metadata from baggage header when metadata is not present', () => {
    const headersObj: Record<string, string> = {
      baggage: 'userId=alice,environment=production',
    };

    updateHeaders(headersObj, mockOrgDetails);

    const metadata = JSON.parse(headersObj[PORTKEY_HEADER_KEYS.METADATA]);
    expect(metadata).toEqual({
      userId: 'alice',
      environment: 'production',
    });
  });

  test('should merge baggage into existing metadata with metadata taking precedence', () => {
    const headersObj: Record<string, string> = {
      [PORTKEY_HEADER_KEYS.METADATA]: JSON.stringify({
        userId: 'bob',
        customKey: 'customValue',
      }),
      baggage: 'userId=alice,environment=production',
    };

    updateHeaders(headersObj, mockOrgDetails);

    const metadata = JSON.parse(headersObj[PORTKEY_HEADER_KEYS.METADATA]);
    expect(metadata).toEqual({
      userId: 'bob', // existing metadata takes precedence
      environment: 'production',
      customKey: 'customValue',
    });
  });

  test('should not set metadata when baggage is invalid', () => {
    const headersObj: Record<string, string> = {
      baggage: 'invalid-baggage-without-equals',
    };

    updateHeaders(headersObj, mockOrgDetails);

    expect(headersObj[PORTKEY_HEADER_KEYS.METADATA]).toBeUndefined();
  });

  test('should support both traceparent and baggage headers together', () => {
    const headersObj: Record<string, string> = {
      traceparent: '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00',
      baggage: 'userId=alice,environment=production',
    };

    updateHeaders(headersObj, mockOrgDetails);

    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBe(
      'bad90143930ea019df8f681254fb2393'
    );
    expect(headersObj[PORTKEY_HEADER_KEYS.PARENT_SPAN_ID]).toBe(
      '42df8ac2dde4ac52'
    );
    // span-id should be newly generated
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toBeDefined();
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toHaveLength(16);

    const metadata = JSON.parse(headersObj[PORTKEY_HEADER_KEYS.METADATA]);
    expect(metadata).toEqual({
      userId: 'alice',
      environment: 'production',
    });
  });

  test('should merge baggage with org defaults metadata', () => {
    const headersObj: Record<string, string> = {
      baggage: 'userId=alice,environment=production',
    };

    const orgDetailsWithMetadata: OrganisationDetails = {
      ...mockOrgDetails,
      defaults: {
        metadata: {
          orgKey: 'orgValue',
        },
      },
    };

    updateHeaders(headersObj, orgDetailsWithMetadata);

    const metadata = JSON.parse(headersObj[PORTKEY_HEADER_KEYS.METADATA]);
    expect(metadata).toEqual({
      userId: 'alice',
      environment: 'production',
      orgKey: 'orgValue',
    });
  });

  test('should extract parent-span-id from traceparent when explicit trace-id is present', () => {
    const headersObj: Record<string, string> = {
      [PORTKEY_HEADER_KEYS.TRACE_ID]: 'explicit-trace-id',
      traceparent: '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00',
    };

    updateHeaders(headersObj, mockOrgDetails);

    // Should keep explicit trace ID but extract parent-span-id from traceparent
    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBe('explicit-trace-id');
    expect(headersObj[PORTKEY_HEADER_KEYS.PARENT_SPAN_ID]).toBe(
      '42df8ac2dde4ac52'
    );
    // span-id should be newly generated
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toBeDefined();
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toHaveLength(16);
  });

  test('should NOT generate trace-id for custom logger endpoints (/v1/logs)', () => {
    const headersObj: Record<string, string> = {};

    updateHeaders(headersObj, mockOrgDetails, '/v1/logs');

    // Should NOT generate a random UUID for custom logger endpoints
    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBeUndefined();
  });

  test('should extract from traceparent even for custom logger endpoints', () => {
    const headersObj: Record<string, string> = {
      traceparent: '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00',
    };

    updateHeaders(headersObj, mockOrgDetails, '/v1/logs');

    // Should still extract from traceparent even for logger endpoints
    expect(headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]).toBe(
      'bad90143930ea019df8f681254fb2393'
    );
    expect(headersObj[PORTKEY_HEADER_KEYS.PARENT_SPAN_ID]).toBe(
      '42df8ac2dde4ac52'
    );
    // span-id should be newly generated
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toBeDefined();
    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]).toHaveLength(16);
  });

  test('should set span-name from request method and path when traceparent is provided', () => {
    const headersObj: Record<string, string> = {
      traceparent: '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00',
    };

    updateHeaders(headersObj, mockOrgDetails, '/v1/chat/completions');

    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_NAME]).toBe(
      'POST /v1/chat/completions'
    );
  });

  test('should not override existing span-name when traceparent is provided', () => {
    const headersObj: Record<string, string> = {
      traceparent: '00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00',
      [PORTKEY_HEADER_KEYS.SPAN_NAME]: 'custom-span-name',
    };

    updateHeaders(headersObj, mockOrgDetails, '/v1/chat/completions');

    expect(headersObj[PORTKEY_HEADER_KEYS.SPAN_NAME]).toBe('custom-span-name');
  });
});
