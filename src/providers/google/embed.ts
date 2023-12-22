import { ErrorResponse, ProviderConfig } from "../types";
import { EmbedParams, EmbedResponse } from "../../types/embedRequestBody";
import { GOOGLE } from "../../globals";
import { GoogleErrorResponse } from "./chatComplete";

export const GoogleEmbedConfig: ProviderConfig = {
    input: {
        param: "content",
        required: true,
        transform: (params: EmbedParams): { parts: { text: string }[] } => {
            const parts = [];
            if (Array.isArray(params.input)) {
                params.input.forEach((i) => {
                    parts.push({
                        text: i,
                    });
                });
            } else {
                parts.push({
                    text: params.input,
                });
            }

            return {
                parts,
            };
        },
    },
    model: {
        param: "model",
        required: true,
        default: "embedding-001",
    },
};

interface GoogleEmbedResponse {
    embedding: {
        values: number[];
    };
}

export const GoogleEmbedResponseTransform: (
    response: GoogleEmbedResponse | GoogleErrorResponse,
    responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && "error" in response) {
        return {
            error: {
                message: response.error.message ?? "",
                type: response.error.status ?? null,
                param: null,
                code: response.error.status ?? null,
            },
            provider: GOOGLE,
        } as ErrorResponse;
    }

    if ("embedding" in response) {
        return {
            object: "list",
            data: [
                {
                    object: "embedding",
                    embedding: response.embedding.values,
                    index: 0,
                },
            ],
            model: "", // Todo: find a way to send the google embedding model name back
            usage: {
                prompt_tokens: -1,
                total_tokens: -1,
            },
        };
    }

    return {
        error: {
            message: `Invalid response recieved from google: ${JSON.stringify(
                response
            )}`,
            type: null,
            param: null,
            code: null,
        },
        provider: GOOGLE,
    } as ErrorResponse;
};
