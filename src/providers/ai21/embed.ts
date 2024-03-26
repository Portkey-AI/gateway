import { ErrorResponse, ProviderConfig } from "../types";
import { EmbedParams, EmbedResponse } from "../../types/embedRequestBody";
import { AI21ErrorResponse } from "./complete";
import { AI21 } from "../../globals";

export const AI21EmbedConfig: ProviderConfig = {
    input: {
        param: "texts",
        required: true,
        transform: (params: EmbedParams): string[] => {
            if (Array.isArray(params.input)) {
                return params.input;
            } else {
                return [params.input];
            }
        },
    },
    type: {
        param: "type",
    },
};

interface AI21EmbedResponse {
    id: string;
    results: {
      embedding: number[];
    }[];
}

export const AI21EmbedResponseTransform: (
    response: AI21EmbedResponse | AI21ErrorResponse,
    responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
    if ('detail' in response && responseStatus !== 200) {
        return {
            error: {
                message: response.detail,
                type: null,
                param: null,
                code: null,
            },
            provider: AI21,
        } as ErrorResponse;
    }

    if ('results' in response) {
      return {
        object: "list",
        data: response.results.map((result, index) => ({
            object: "embedding",
            embedding: result.embedding,
            index: index,
        })),
        model: "",
        provider: AI21,
        usage: {
            prompt_tokens: -1,
            total_tokens: -1,
        },
      };
    }
    return {
      error: {
          message: `Invalid response recieved from ${AI21}: ${JSON.stringify(
              response
          )}`,
          type: null,
          param: null,
          code: null,
      },
      provider: AI21,
    } as ErrorResponse;
};
