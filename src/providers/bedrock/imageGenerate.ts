import { BEDROCK } from "../../globals";
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from "../types";
import { BedrockErrorResponse } from "./embed";

export const BedrockStabilityAIImageGenerateConfig: ProviderConfig = {
    prompt: {
        param: "text_prompts",
        required: true,
        transform: (params: any) => {
            return [
                {
                    text: params.prompt,
                    weight: 1,
                },
            ];
        },
    },
    n: {
        param: "samples",
        min: 1,
        max: 10,
    },
    size: [
        {
            param: "height",
            transform: (params: any) =>
                parseInt(params.size.toLowerCase().split("x")[1]),
            min: 320,
        },
        {
            param: "width",
            transform: (params: any) =>
                parseInt(params.size.toLowerCase().split("x")[0]),
            min: 320,
        },
    ],
    style: {
        param: "style_preset",
    },
};

interface ImageArtifact {
    base64: string;
    finishReason: "CONTENT_FILTERED" | "ERROR" | "SUCCESS";
    seed: number;
}

interface BedrockStabilityAIImageGenerateResponse {
    result: string;
    artifacts: ImageArtifact[];
}

export const BedrockStabilityAIImageGenerateResponseTransform: (
    response: BedrockStabilityAIImageGenerateResponse | BedrockErrorResponse,
    responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && "message" in response) {
        return {
            error: {
                message: response.message,
                type: "",
                param: null,
                code: null,
            },
            provider: BEDROCK,
        };
    }

    if ("artifacts" in response) {
        return {
            created: `${new Date().getTime()}`,
            data: response.artifacts.map((art) => ({ b64_json: art.base64 })),
            provider: BEDROCK,
        };
    }

    return {
        error: {
            message: `Invalid response recieved from ${BEDROCK}: ${JSON.stringify(
                response
            )}`,
            type: null,
            param: null,
            code: null,
        },
        provider: BEDROCK,
    } as ErrorResponse;
};
