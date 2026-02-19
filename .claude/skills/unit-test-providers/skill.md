# Skill: Unit Testing Provider Transformations

## When to Use

- Adding new parameters to providers (e.g., `media_resolution`, `reasoning_effort`)
- Creating new provider integrations
- Testing parameter transformations (top-level and inline)

## Self-Update Policy

**IMPORTANT**: Update this skill when:
- Test patterns change (new mocks needed, different test structure)
- New testing utilities are introduced
- Common issues/solutions are discovered
- Better practices are identified

Keep updates concise. Remove outdated information.

## Quick Setup

### 1. File Structure

```
src/providers/google/__tests__/feature-name.test.ts
```

### 2. Required Mocks

```typescript
jest.mock('../../../data-stores/redis', () => ({
  redisClient: null,
  redisReaderClient: null,
}));

jest.mock('../../../utils/awsAuth', () => ({}));

jest.mock('../../..', () => ({}));
```

**Why**: Prevents top-level `await` execution, avoids infrastructure dependencies.

### 3. Imports

```typescript
import { transformUsingProviderConfig } from '../../../services/transformToProviderRequest';
import { ProviderConfig } from '../chatComplete';
import { Params } from '../../../types/requestBody';
```

## Test Patterns

### Top-Level Parameters

```typescript
describe('Top-level parameter_name', () => {
  it('should transform parameter', () => {
    const params = {
      model: 'model-name',
      parameter_name: 'VALUE',
      messages: [],
    } as Params;

    const result = transformUsingProviderConfig(ProviderConfig, params);

    expect(result.targetField.parameterName).toBe('VALUE');
  });

  it('should handle absence', () => {
    const params = { model: 'model-name', messages: [] } as Params;
    const result = transformUsingProviderConfig(ProviderConfig, params);

    expect(result.targetField?.parameterName).toBeUndefined();
  });
});
```

### Inline Parameters

```typescript
describe('Inline parameter_name', () => {
  it('should transform inline parameter', () => {
    const params = {
      model: 'model-name',
      messages: [{
        role: 'user',
        content: [{
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,abc...',
            parameter_name: 'VALUE',
          },
        }],
      }],
    } as Params;

    const result = transformUsingProviderConfig(ProviderConfig, params);

    expect(result.contents[0].parts[0]).toHaveProperty('parameterName', 'VALUE');
  });
});
```

### Combined (Top-Level + Inline)

```typescript
it('should support both levels', () => {
  const params = {
    model: 'model-name',
    parameter_name: 'TOP_LEVEL',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Text' },
        {
          type: 'image_url',
          image_url: { url: 'gs://image1.png', parameter_name: 'INLINE' }
        },
        {
          type: 'image_url',
          image_url: { url: 'gs://image2.png' } // No inline
        },
      ],
    }],
  } as Params;

  const result = transformUsingProviderConfig(ProviderConfig, params);

  expect(result.targetField.parameterName).toBe('TOP_LEVEL');
  expect(result.contents[0].parts[0]).not.toHaveProperty('parameterName');
  expect(result.contents[0].parts[1]).toHaveProperty('parameterName', 'INLINE');
  expect(result.contents[0].parts[2]).not.toHaveProperty('parameterName');
});
```

### Config Verification

```typescript
describe('Config integration', () => {
  it('should have parameter in config', () => {
    expect(ProviderConfig).toHaveProperty('parameter_name');
    expect(ProviderConfig.parameter_name).toEqual({
      param: 'targetField',
      transform: expect.any(Function),
    });
  });
});
```

## Running Tests

```bash
# Specific test
npx jest src/providers/provider-name/__tests__/feature.test.ts --verbose

# All provider tests
npm run test:gateway
```

## Jest Config (if needed)

```typescript
// jest.config.ts
{
  transform: {
    '^.+\\.(ts|js)$': ['ts-jest', {
      tsconfig: {
        module: 'ESNext',
        target: 'ES2020',
      },
      isolatedModules: true,
      diagnostics: {
        ignoreCodes: [151002, 1378],
      },
    }],
  },
}
```

## Common Issues

| Issue | Solution |
|-------|----------|
| "await is only valid in async functions" | Add mocks for Redis/AWS/App |
| Tests are slow | Check all mocks are in place |
| "Cannot find module" | Verify import paths (`../../../`) |

## Examples

See working implementation:
- `src/providers/google/__tests__/media-resolution.test.ts`
- `src/providers/google-vertex-ai/__tests__/media-resolution.test.ts`

## Best Practices

1. Use `transformUsingProviderConfig` (tests real pipeline)
2. Always mock infrastructure (Redis, AWS Auth, Main App)
3. Test presence, absence, and all valid values
4. Keep tests fast and isolated
5. Use descriptive test names
