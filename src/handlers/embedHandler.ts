import { Context } from "hono";
import { RequestBody } from "../types/requestBody";
import {
  fetchProviderOptionsFromConfig,
  tryProvidersInSequence,
} from "./handlerUtils";

export async function embedHandler(
  c: Context,
  env: any,
  request: RequestBody,
  requestHeaders: Record<string, string>
): Promise<Response> {
  try {
    let providerOptions = fetchProviderOptionsFromConfig(request.config);
    if (!providerOptions) {
      const errorResponse = {
        error: { message: `Could not find a provider option.` },
      };
      throw errorResponse;
    }
    const response = await tryProvidersInSequence(
      c,
      providerOptions,
      request,
      requestHeaders,
      "embed"
    );

    return response;
  } catch (error: any) {
    // If an error occurs, log it and rethrow it
    console.error(`Error in embedHandler: ${error.message}`);
    const errorArray = JSON.parse(error.message);
    throw errorArray[errorArray.length - 1];
  }
}
