import { Context } from 'hono';
import models from '../data/models.json';
import providers from '../data/providers.json';

/**
 * Handles the models request. Returns a list of models supported by the Ai gateway.
 * Allows filters in query params for the provider
 * @param c - The Hono context
 * @returns - The response
 */
export async function modelsHandler(c: Context): Promise<Response> {
  // If the request does not contain a provider query param, return all models. Add a count as well.
  const provider = c.req.query('provider');
  if (!provider) {
    return c.json({
      ...models,
      count: models.data.length,
    });
  } else {
    // Filter the models by the provider
    const filteredModels = models.data.filter(
      (model: any) => model.provider.id === provider
    );
    return c.json({
      ...models,
      data: filteredModels,
      count: filteredModels.length,
    });
  }
}

export async function providersHandler(c: Context): Promise<Response> {
  return c.json({
    ...providers,
    count: providers.data.length,
  });
}
