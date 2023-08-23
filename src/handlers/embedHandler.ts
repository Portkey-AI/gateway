import { Context } from "hono";
import { EmbedRequestBody } from "../types/embedRequestBody";
import { Options } from "../types/requestBody";
import { tryPost } from "./handlerUtils";

export async function embedHandler(c: Context, env: any, request: EmbedRequestBody, requestHeaders: Record<string, string>): Promise<Response> {
  let providerOption:Options|null;
  
  try {

    if ('provider' in request.config) {
      providerOption = {
        provider: request.config.provider, 
        apiKeyName: request.config.apiKeyName, 
        apiKey: request.config.apiKey
      };
    } else if ('options' in request.config && !!request.config.options) {
      // We always pick the first option for now
      providerOption = request.config.options[0];
    } else {
      throw "Could not find a provider";
    }

    const response = await tryPost(c, providerOption, request, requestHeaders,  "embed");

    return response;
  } catch (error:any) {
    // If an error occurs, log it and rethrow it
    console.error(`Error in embedHandler: ${error.message}`);
    throw error;
  }
}
