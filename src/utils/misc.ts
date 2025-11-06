import { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';

export function toSnakeCase(str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2') // Handle camelCase and PascalCase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2') // Handle acronyms
    .replace(/[^a-zA-Z0-9]+/g, '_') // Replace special characters with '_'
    .replace(/_+/g, '_') // Merge multiple underscores
    .toLowerCase();
}

export const addBackgroundTask = (
  c: Context,
  promise: Promise<void | unknown>
) => {
  if (getRuntimeKey() === 'workerd') {
    c.executionCtx.waitUntil(promise);
  }
  // in other runtimes, the promise resolves in the background
};
