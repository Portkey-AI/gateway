import { EmbedResponse } from "../../types/embedRequestBody";
import { ErrorResponse, ProviderConfig } from "../types";

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

export interface AnyscaleEmbedResponse extends EmbedResponse, ErrorResponse {}


export const AnyscaleEmbedResponseTransform: (response: AnyscaleEmbedResponse, responseStatus: number) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200) {
      return {
          error: {
              message: response.error?.message,
              type: response.error?.type,
              param: null,
              code: null
          },
          provider: "anyscale"
      } as ErrorResponse;
    } 
  
    return {
        object: response.object,
        data: response.data,
        model: response.model,
        usage: response.usage,
      }
  }
