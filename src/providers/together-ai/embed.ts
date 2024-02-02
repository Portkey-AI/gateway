import { TOGETHER_AI } from "../../globals";
import { EmbedParams, EmbedResponse } from "../../types/embedRequestBody";
import { ErrorResponse, ProviderConfig } from "../types";
import { TogetherAIErrorResponse, TogetherAIErrorResponseTransform } from "./chatComplete";

export const TogetherAIEmbedConfig: ProviderConfig = {
    model: {
        param: "model",
        required: true,
        default: "mistral-embed",
    },
    input: {
        param: "input",
        required: true,
        transform: (params: EmbedParams) => {
            if (Array.isArray(params.input)) {
                return params.input;
            }

            return [params.input];
        },
    },
};

interface TogetherAIEmbedResponse extends EmbedResponse {}

export const TogetherAIEmbedResponseTransform: (
    response: TogetherAIEmbedResponse | TogetherAIErrorResponse,
    responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && !("data" in response) ) {
        const errorResponse = TogetherAIErrorResponseTransform(response);
        if (errorResponse) return errorResponse;
      }

    if ("data" in response) {
        return {
            object: response.object,
            data: response.data.map((d) => ({
                object: d.object,
                embedding: d.embedding,
                index: d.index,
            })),
            model: response.model,
            usage: {
                prompt_tokens: 0,
                total_tokens: 0,
            },
            provider: TOGETHER_AI,
        };
    }

    return {
        error: {
            message: `Invalid response recieved from ${TOGETHER_AI}: ${JSON.stringify(
                response
            )}`,
            type: null,
            param: null,
            code: null,
        },
        provider: TOGETHER_AI,
    } as ErrorResponse;
};
