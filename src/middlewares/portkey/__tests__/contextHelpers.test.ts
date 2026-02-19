import {
  ContextKeys,
  getContext,
  setContext,
  getOrParseFromHeader,
  hasContext,
  PortkeyContextValues,
} from '../contextHelpers';
import { Context } from 'hono';
import { EntityStatus } from '../globals';
import { OrganisationDetails } from '../types';
import { HookType } from '../../hooks/types';

// Mock Hono Context
const createMockContext = (): Context => {
  const store = new Map<string, any>();
  return {
    get: jest.fn((key: string) => store.get(key)),
    set: jest.fn((key: string, value: any) => store.set(key, value)),
  } as unknown as Context;
};

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
  scopes: ['read', 'write'],
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
    systemDefaults: {},
  },
  organisationDefaults: {},
};

describe('contextHelpers', () => {
  describe('setContext and getContext', () => {
    test('should store and retrieve organisation details', () => {
      const c = createMockContext();

      setContext(c, ContextKeys.ORGANISATION_DETAILS, mockOrgDetails);
      const result = getContext(c, ContextKeys.ORGANISATION_DETAILS);

      expect(result).toEqual(mockOrgDetails);
    });

    test('should return undefined for unset context', () => {
      const c = createMockContext();

      const result = getContext(c, ContextKeys.ORGANISATION_DETAILS);

      expect(result).toBeUndefined();
    });

    test('should store and retrieve parsed config', () => {
      const c = createMockContext();
      const config = { strategy: { mode: 'single' }, targets: [] };

      setContext(c, ContextKeys.PARSED_CONFIG, config);
      const result = getContext(c, ContextKeys.PARSED_CONFIG);

      expect(result).toEqual(config);
    });

    test('should store and retrieve parsed metadata', () => {
      const c = createMockContext();
      const metadata = { userId: 'user-123', environment: 'production' };

      setContext(c, ContextKeys.PARSED_METADATA, metadata);
      const result = getContext(c, ContextKeys.PARSED_METADATA);

      expect(result).toEqual(metadata);
    });

    test('should store null values', () => {
      const c = createMockContext();

      setContext(c, ContextKeys.PARSED_CONFIG, null);
      const result = getContext(c, ContextKeys.PARSED_CONFIG);

      expect(result).toBeNull();
    });

    test('should store empty arrays for guardrails', () => {
      const c = createMockContext();

      setContext(c, ContextKeys.DEFAULT_INPUT_GUARDRAILS, []);
      const result = getContext(c, ContextKeys.DEFAULT_INPUT_GUARDRAILS);

      expect(result).toEqual([]);
    });
  });

  describe('hasContext', () => {
    test('should return true when context value exists', () => {
      const c = createMockContext();

      setContext(c, ContextKeys.ORGANISATION_DETAILS, mockOrgDetails);

      expect(hasContext(c, ContextKeys.ORGANISATION_DETAILS)).toBe(true);
    });

    test('should return false when context value does not exist', () => {
      const c = createMockContext();

      expect(hasContext(c, ContextKeys.ORGANISATION_DETAILS)).toBe(false);
    });

    test('should return true for null values (null is a valid set value)', () => {
      const c = createMockContext();

      setContext(c, ContextKeys.PARSED_CONFIG, null);

      // null is a valid value, so hasContext should return true
      expect(hasContext(c, ContextKeys.PARSED_CONFIG)).toBe(true);
    });
  });

  describe('getOrParseFromHeader', () => {
    test('should return context value if already set', () => {
      const c = createMockContext();
      const headersObj = {
        'x-auth-organisation-details': JSON.stringify({
          id: 'header-org',
        }),
      };

      // Set context value first
      setContext(c, ContextKeys.ORGANISATION_DETAILS, mockOrgDetails);

      const result = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      // Should return context value, not header value
      expect(result).toEqual(mockOrgDetails);
      expect(result?.id).toBe('org-123');
    });

    test('should parse from header when context is not set', () => {
      const c = createMockContext();
      const headersObj = {
        'x-auth-organisation-details': JSON.stringify(mockOrgDetails),
      };

      const result = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      expect(result).toEqual(mockOrgDetails);
    });

    test('should cache parsed header value in context', () => {
      const c = createMockContext();
      const headersObj = {
        'x-auth-organisation-details': JSON.stringify(mockOrgDetails),
      };

      // First call parses from header
      getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      // Verify it was cached in context
      const cachedValue = getContext(c, ContextKeys.ORGANISATION_DETAILS);
      expect(cachedValue).toEqual(mockOrgDetails);
    });

    test('should return undefined when neither context nor header has value', () => {
      const c = createMockContext();
      const headersObj = {};

      const result = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      expect(result).toBeUndefined();
    });

    test('should return undefined for invalid JSON in header', () => {
      const c = createMockContext();
      const headersObj = {
        'x-auth-organisation-details': 'invalid-json{',
      };

      const result = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      expect(result).toBeUndefined();
    });

    test('should work with parsed config', () => {
      const c = createMockContext();
      const config = {
        strategy: { mode: 'fallback' },
        targets: [{ provider: 'openai' }],
      };
      const headersObj = {
        'x-portkey-config': JSON.stringify(config),
      };

      const result = getOrParseFromHeader(
        c,
        ContextKeys.PARSED_CONFIG,
        'x-portkey-config',
        headersObj
      );

      expect(result).toEqual(config);
    });

    test('should work with guardrails arrays', () => {
      const c = createMockContext();
      const guardrails = [
        { id: 'guard-1', type: 'input', checks: [] },
        { id: 'guard-2', type: 'input', checks: [] },
      ];
      const headersObj = {
        'x-portkey-default-input-guardrails': JSON.stringify(guardrails),
      };

      const result = getOrParseFromHeader(
        c,
        ContextKeys.DEFAULT_INPUT_GUARDRAILS,
        'x-portkey-default-input-guardrails',
        headersObj
      );

      expect(result).toEqual(guardrails);
    });

    test('should handle empty string header value', () => {
      const c = createMockContext();
      const headersObj = {
        'x-auth-organisation-details': '',
      };

      const result = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      // Empty string is falsy, so should return undefined
      expect(result).toBeUndefined();
    });

    test('should NOT cache value when JSON parsing fails', () => {
      const c = createMockContext();
      const headersObj = {
        'x-auth-organisation-details': 'not-valid-json',
      };

      // Call should return undefined due to parse failure
      const result = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      expect(result).toBeUndefined();

      // Context should NOT have been set
      const cachedValue = getContext(c, ContextKeys.ORGANISATION_DETAILS);
      expect(cachedValue).toBeUndefined();
    });

    test('should use cached context value on subsequent calls (no re-parsing)', () => {
      const c = createMockContext();
      const headersObj = {
        'x-auth-organisation-details': JSON.stringify(mockOrgDetails),
      };

      // First call - parses from header
      const result1 = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      // Modify header to different value
      headersObj['x-auth-organisation-details'] = JSON.stringify({
        id: 'different-org',
      });

      // Second call - should return cached value, not re-parse
      const result2 = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      expect(result1).toEqual(mockOrgDetails);
      expect(result2).toEqual(mockOrgDetails); // Same as first, not re-parsed
      expect(result2?.id).toBe('org-123'); // Not 'different-org'
    });

    test('should handle undefined header value', () => {
      const c = createMockContext();
      const headersObj: Record<string, string> = {
        'some-other-header': 'value',
      };
      // Explicitly set to undefined
      (headersObj as any)['x-auth-organisation-details'] = undefined;

      const result = getOrParseFromHeader(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        'x-auth-organisation-details',
        headersObj
      );

      expect(result).toBeUndefined();
    });
  });

  describe('context value overwriting', () => {
    test('should allow overwriting existing context values', () => {
      const c = createMockContext();
      const newOrgDetails = { ...mockOrgDetails, id: 'new-org-456' };

      setContext(c, ContextKeys.ORGANISATION_DETAILS, mockOrgDetails);
      setContext(c, ContextKeys.ORGANISATION_DETAILS, newOrgDetails);

      const result = getContext(c, ContextKeys.ORGANISATION_DETAILS);
      expect(result?.id).toBe('new-org-456');
    });

    test('should allow setting value to null after having a value', () => {
      const c = createMockContext();

      setContext(c, ContextKeys.PARSED_CONFIG, { strategy: 'test' });
      setContext(c, ContextKeys.PARSED_CONFIG, null);

      const result = getContext(c, ContextKeys.PARSED_CONFIG);
      expect(result).toBeNull();
    });
  });

  describe('ContextKeys enum', () => {
    test('should have expected keys', () => {
      expect(ContextKeys.ORGANISATION_DETAILS).toBe('organisationDetails');
      expect(ContextKeys.PARSED_CONFIG).toBe('parsedConfig');
      expect(ContextKeys.PARSED_METADATA).toBe('parsedMetadata');
      expect(ContextKeys.VIRTUAL_KEY_DETAILS).toBe('virtualKeyDetails');
      expect(ContextKeys.INTEGRATION_DETAILS).toBe('integrationDetails');
      expect(ContextKeys.DEFAULT_INPUT_GUARDRAILS).toBe(
        'defaultInputGuardrails'
      );
      expect(ContextKeys.DEFAULT_OUTPUT_GUARDRAILS).toBe(
        'defaultOutputGuardrails'
      );
      expect(ContextKeys.REQUEST_BODY_DATA).toBe('requestBodyData');
      expect(ContextKeys.MAPPED_HEADERS).toBe('mappedHeaders');
      expect(ContextKeys.HEADERS_OBJ).toBe('headersObj');
      expect(ContextKeys.HOOKS_MANAGER).toBe('hooksManager');
    });
  });

  describe('additional context types', () => {
    test('should store and retrieve virtual key details', () => {
      const c = createMockContext();
      const virtualKeyDetails = {
        id: 'vk-123',
        slug: 'my-virtual-key',
        usage_limits: [],
        rate_limits: [],
        status: EntityStatus.ACTIVE,
        workspace_id: 'ws-123',
        organisation_id: 'org-123',
        expires_at: '2025-12-31',
      };

      setContext(c, ContextKeys.VIRTUAL_KEY_DETAILS, virtualKeyDetails);
      const result = getContext(c, ContextKeys.VIRTUAL_KEY_DETAILS);

      expect(result).toEqual(virtualKeyDetails);
    });

    test('should store and retrieve integration details', () => {
      const c = createMockContext();
      const integrationDetails = {
        id: 'int-123',
        slug: 'my-integration',
        usage_limits: [],
        rate_limits: [],
        status: EntityStatus.ACTIVE,
        allow_all_models: true,
        models: [],
      };

      setContext(c, ContextKeys.INTEGRATION_DETAILS, integrationDetails);
      const result = getContext(c, ContextKeys.INTEGRATION_DETAILS);

      expect(result).toEqual(integrationDetails);
    });

    test('should store and retrieve mapped headers', () => {
      const c = createMockContext();
      const mappedHeaders = {
        'content-type': 'application/json',
        authorization: 'Bearer token',
      };

      setContext(c, ContextKeys.MAPPED_HEADERS, mappedHeaders);
      const result = getContext(c, ContextKeys.MAPPED_HEADERS);

      expect(result).toEqual(mappedHeaders);
    });

    test('should store and retrieve output guardrails', () => {
      const c = createMockContext();
      const guardrails = [
        {
          id: 'guard-out-1',
          type: HookType.GUARDRAIL,
          eventType: 'afterRequestHook' as const,
        },
      ];

      setContext(c, ContextKeys.DEFAULT_OUTPUT_GUARDRAILS, guardrails);
      const result = getContext(c, ContextKeys.DEFAULT_OUTPUT_GUARDRAILS);

      expect(result).toEqual(guardrails);
    });
  });
});
