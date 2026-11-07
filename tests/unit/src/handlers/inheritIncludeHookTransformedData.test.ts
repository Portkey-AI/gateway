import { inheritIncludeHookTransformedData } from '../../../../src/handlers/includeHookTransformedData';
import { convertKeysToCamelCase } from '../../../../src/utils';

describe('include_hook_transformed_data config inheritance', () => {
  it('camel-cases include_hook_transformed_data from the gateway config', () => {
    const config = convertKeysToCamelCase({
      provider: 'openai',
      api_key: 'sk-test',
      include_hook_transformed_data: true,
      before_request_hooks: [{ id: 'hook' }],
    });

    expect(config.includeHookTransformedData).toBe(true);
    expect(config.beforeRequestHooks).toEqual([{ id: 'hook' }]);
  });

  it('copies a parent opt-in onto a target that does not set the flag', () => {
    const currentTarget: Record<string, any> = { provider: 'openai' };
    const inheritedConfig = { includeHookTransformedData: true };
    const currentInheritedConfig: Record<string, any> = {};

    inheritIncludeHookTransformedData(
      currentTarget,
      inheritedConfig,
      currentInheritedConfig
    );

    expect(currentTarget.includeHookTransformedData).toBe(true);
    expect(currentInheritedConfig.includeHookTransformedData).toBe(true);
  });

  it('lets a target-level false override a parent opt-in', () => {
    const currentTarget: Record<string, any> = {
      includeHookTransformedData: false,
    };
    const inheritedConfig = { includeHookTransformedData: true };
    const currentInheritedConfig: Record<string, any> = {};

    inheritIncludeHookTransformedData(
      currentTarget,
      inheritedConfig,
      currentInheritedConfig
    );

    expect(currentTarget.includeHookTransformedData).toBe(false);
    expect(currentInheritedConfig.includeHookTransformedData).toBe(false);
  });

  it('keeps a target-level true when the parent opted out', () => {
    const currentTarget: Record<string, any> = {
      includeHookTransformedData: true,
    };
    const inheritedConfig = { includeHookTransformedData: false };
    const currentInheritedConfig: Record<string, any> = {};

    inheritIncludeHookTransformedData(
      currentTarget,
      inheritedConfig,
      currentInheritedConfig
    );

    expect(currentTarget.includeHookTransformedData).toBe(true);
    expect(currentInheritedConfig.includeHookTransformedData).toBe(true);
  });

  it('leaves the target unchanged when neither level sets the flag', () => {
    const currentTarget: Record<string, any> = { provider: 'openai' };
    const currentInheritedConfig: Record<string, any> = {};

    inheritIncludeHookTransformedData(
      currentTarget,
      {},
      currentInheritedConfig
    );

    expect(currentTarget.includeHookTransformedData).toBeUndefined();
    expect(currentInheritedConfig.includeHookTransformedData).toBeUndefined();
  });
});
