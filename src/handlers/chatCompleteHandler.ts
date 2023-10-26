import { RequestBody } from "../types/requestBody";
import {
  fetchProviderOptionsFromConfig,
  tryProvidersInSequence,
} from "./handlerUtils";
import { Context } from "hono";

// const OPENAI_CHAT_MODELS = ["gpt-4-0613","gpt-3.5-turbo-16k-0613","gpt-3.5-turbo-0301","gpt-3.5-turbo","gpt-3.5-turbo-0613","gpt-4","gpt-4-0314","gpt-3.5-turbo-16k","gpt-4-32k-0314","gpt-4-32k-0613","gpt-4-32k"]

/**
 * Handles the 'chatComplete' API request by selecting the appropriate provider(s) and making the request to them.
 *
 * The environment variables (`env`) should be the cloudflare environment variables.
 *
 * The `request` parameter is an object that includes:
 * - `config`: An object that specifies how the request should be handled. It can either be a `ShortConfig` object with `provider` and `apiKeyName` fields, or a `Config` object with `mode` and `options` fields.
 *   The `mode` can be "single" (uses the first provider), "loadbalance" (selects one provider based on weights), or "fallback" (uses all providers in the given order).
 * - `params`: An object that specifies the parameters of the request, such as `model`, `prompt`, `messages`, etc.
 *
 * If a provider is specified in the request config, that provider is used. Otherwise, the provider options are determined based on the mode in the request config.
 * If no provider options can be determined, an error is thrown. If the request to the provider(s) fails, an error is also thrown.
 *
 * This function returns a `CResponse` object which includes `id`, `object`, `created`, `model`, `choices`, and `usage` fields.
 *
 * @param {any} env - The cloudflare environment variables.
 * @param {RequestBody} request - The request body, which includes the config for the request (provider, mode, etc.).
 * @returns {Promise<CResponse>} - The response from the provider.
 * @throws Will throw an error if no provider options can be determined or if the request to the provider(s) fails.
 */
export async function chatCompleteHandler(
  c: Context,
  env: any,
  request: RequestBody,
  requestHeaders: Record<string, string>
): Promise<Response> {
  const providerOptions = fetchProviderOptionsFromConfig(request.config);

  if (!providerOptions) {
    const errorResponse = {
      error: { message: `Could not find a provider option.` },
    };
    throw errorResponse;
  }

  try {
    return await tryProvidersInSequence(
      c,
      providerOptions,
      request,
      requestHeaders,
      "chatComplete"
    );
  } catch (error: any) {
    const errorArray = JSON.parse(error.message);
    throw errorArray[errorArray.length - 1];
  }
}
