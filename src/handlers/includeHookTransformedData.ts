/**
 * Resolve `include_hook_transformed_data` for a target.
 * A boolean on the target wins. Otherwise a parent boolean is copied onto
 * the target so tryPost sees the same opt-in the parent config declared.
 */
export function inheritIncludeHookTransformedData(
  currentTarget: Record<string, any>,
  inheritedConfig: Record<string, any>,
  currentInheritedConfig: Record<string, any>
): void {
  if (typeof currentTarget.includeHookTransformedData === 'boolean') {
    currentInheritedConfig.includeHookTransformedData =
      currentTarget.includeHookTransformedData;
    return;
  }

  if (typeof inheritedConfig.includeHookTransformedData === 'boolean') {
    currentInheritedConfig.includeHookTransformedData =
      inheritedConfig.includeHookTransformedData;
    currentTarget.includeHookTransformedData =
      inheritedConfig.includeHookTransformedData;
  }
}
