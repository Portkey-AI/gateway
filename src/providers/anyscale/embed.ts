import { ANYSCALE } from "../../globals";
import { EmbedResponse } from "../../types/embedRequestBody";
import { ErrorResponse, ProviderConfig } from "../types";
import { AnyscaleErrorResponse, AnyscaleValidationErrorResponse, AnyscaleValidationErrorResponseTransform } from "./chatComplete";

export const AnyscaleEmbedConfig: ProviderConfig = {
  model: {
    param: "model",
    required: true,
    default: "thenlper/gte-large",
  },
  input: {
    param: "input",
    default: ""
  },
  user: {
    param: "user",
  }
};

export interface AnyscaleEmbedResponse extends EmbedResponse {}


export const AnyscaleEmbedResponseTransform: (response: AnyscaleEmbedResponse | AnyscaleErrorResponse | AnyscaleValidationErrorResponse, responseStatus: number) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
    if (
      "detail" in response &&
      responseStatus !== 200 &&
      response.detail.length
    ) {
      return AnyscaleValidationErrorResponseTransform(response);
    }
      

    if ('error' in response && responseStatus !== 200) {
      return {
          error: {
              message: response.error?.message,
              type: response.error?.type,
              param: null,
              code: null
          },
          provider: ANYSCALE
      } as ErrorResponse;
    } 
    
    if ('data' in response) {
      return {
        object: response.object,
        data: response.data,
        model: response.model,
        usage: response.usage,
      }
    }

    return {
      error: {
        message: `Invalid response recieved from ${ANYSCALE}: ${JSON.stringify(
          response
        )}`,
        type: null,
        param: null,
        code: null,
      },
      provider: ANYSCALE,
    } as ErrorResponse;
  }
