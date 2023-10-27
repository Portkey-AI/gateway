import { EmbedParams, EmbedResponse } from "../../types/embedRequestBody";
import { ProviderConfig } from "../types";

export const PalmEmbedConfig: ProviderConfig = {
    input: {
        param: "text",
        required: true,
        transform: (params: EmbedParams): string[] => {
            if (Array.isArray(params.input)) {
                return params.input;
            } else {
                return [params.input];
            }
        }
    },
    model: {
        param: "model",
        default: "models/embedding-gecko-001",
    },
};

interface embedding {
    value: number[]
}

interface PalmEmbedResponse {
    embedding: embedding
}

export const PalmEmbedResponseTransform: (response: PalmEmbedResponse) => EmbedResponse = (response) => {
    return {
    object: "list",
    data: [{
        object: "embedding",
        embedding: response.embedding.value,
        index: 0,
    }],
    model: "",
    usage: {
        prompt_tokens: -1,
        total_tokens: -1
    },
}};