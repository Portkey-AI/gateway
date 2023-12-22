import { GOOGLE } from "../../globals";
import { ContentType, Message, Params } from "../../types/requestBody";
import {
    ChatCompletionResponse,
    ErrorResponse,
    ProviderConfig,
} from "../types";

const transformGenerationConfig = (params: Params) => {
    const generationConfig: Record<string, any> = {};
    if (params["temperature"]) {
        generationConfig["temperature"] = params["temperature"];
    }
    if (params["top_p"]) {
        generationConfig["topP"] = params["top_p"];
    }
    if (params["top_k"]) {
        generationConfig["topK"] = params["top_k"];
    }
    if (params["top_k"]) {
        generationConfig["topK"] = params["top_k"];
    }
    if (params["max_tokens"]) {
        generationConfig["maxOutputTokens"] = params["max_tokens"];
    }
    if (params["stop"]) {
        generationConfig["stopSequences"] = params["stop"];
    }
    return generationConfig;
};

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const GoogleChatCompleteConfig: ProviderConfig = {
    model: {
        param: "model",
        required: true,
        default: "gemini-pro",
    },
    messages: {
        param: "contents",
        default: "",
        transform: (params: Params) => {
            const messages = params.messages?.map((message: Message) => {
                const role = message.role === "assistant" ? "model" : "user";
                let parts = [];
                if (typeof message.content === "string") {
                    parts.push({
                        text: message.content,
                    });
                }

                if (message.content && typeof message.content === "object") {
                    message.content.forEach((c: ContentType) => {
                        if (c.type === "text") {
                            parts.push({
                                text: c.text,
                            });
                        }
                        if (c.type === "image_url") {
                            parts.push({
                                inlineData: {
                                    mimeType: "image/jpeg",
                                    data: c.image_url?.url,
                                },
                            });
                        }
                    });
                }
                return { role, parts };
            });
            return messages;
        },
    },
    temperature: {
        param: "generationConfig",
        transform: (params: Params) => transformGenerationConfig(params),
    },
    top_p: {
        param: "generationConfig",
        transform: (params: Params) => transformGenerationConfig(params),
    },
    top_k: {
        param: "generationConfig",
        transform: (params: Params) => transformGenerationConfig(params),
    },
    max_tokens: {
        param: "generationConfig",
        transform: (params: Params) => transformGenerationConfig(params),
    },
    stop: {
        param: "generationConfig",
        transform: (params: Params) => transformGenerationConfig(params),
    },
    tools: {
        param: "tools",
        default: "",
        transform: (params: Params) => {
            const functionDeclarations: any = [];
            params.tools?.forEach((tool) => {
                if (tool.type === "function") {
                    functionDeclarations.push(tool.function);
                }
            });
            return [{ functionDeclarations }];
        },
    },
};

export interface GoogleErrorResponse {
    error: {
        code: number;
        message: string;
        status: string;
        details: Array<Record<string, any>>;
    };
}

interface GoogleGenerateFunctionCall {
    name: string;
    args: Record<string, any>;
}

interface GoogleGenerateContentResponse {
    candidates: {
        content: {
            parts: {
                text?: string;
                functionCall?: GoogleGenerateFunctionCall;
            }[];
        };
        finishReason: string;
        index: 0;
        safetyRatings: {
            category: string;
            probability: string;
        }[];
    }[];
    promptFeedback: {
        safetyRatings: {
            category: string;
            probability: string;
        }[];
    };
}

export const GoogleChatCompleteResponseTransform: (
    response: GoogleGenerateContentResponse | GoogleErrorResponse,
    responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
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

    if ("candidates" in response) {
        return {
            id: crypto.randomUUID(),
            object: "chat_completion",
            created: Math.floor(Date.now() / 1000),
            model: "Unknown",
            provider: "google",
            choices:
                response.candidates?.map((generation, index) => {
                    let message: Message = { role: "assistant", content: "" };
                    if (generation.content.parts[0]?.text) {
                        message = {
                            role: "assistant",
                            content: generation.content.parts[0]?.text,
                        };
                    } else if (generation.content.parts[0]?.functionCall) {
                        message = {
                            role: "assistant",
                            tool_calls: [
                                {
                                    id: crypto.randomUUID(),
                                    type: "function",
                                    function: {
                                        name: generation.content.parts[0]
                                            ?.functionCall.name,
                                        arguments: JSON.stringify(
                                            generation.content.parts[0]
                                                ?.functionCall.args
                                        ),
                                    },
                                },
                            ],
                        };
                    }
                    return {
                        message: message,
                        index: generation.index,
                        finish_reason: generation.finishReason,
                    };
                }) ?? [],
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

export const GoogleChatCompleteStreamChunkTransform: (
    response: string,
    fallbackId: string
) => string = (responseChunk, fallbackId) => {
    let chunk = responseChunk.trim();
    if (chunk.startsWith("[")) {
        chunk = chunk.slice(1);
    }

    if (chunk.endsWith(",")) {
        chunk = chunk.slice(0, chunk.length - 1);
    }
    if (chunk.endsWith("]")) {
        chunk = chunk.slice(0, chunk.length - 2);
    }
    chunk = chunk.replace(/^data: /, "");
    chunk = chunk.trim();
    if (chunk === "[DONE]") {
        return `data: ${chunk}\n\n`;
    }

    const parsedChunk: GoogleGenerateContentResponse = JSON.parse(chunk);

    return (
        `data: ${JSON.stringify({
            id: fallbackId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: "google",
            choices:
                parsedChunk.candidates?.map((generation, index) => {
                    let message: Message = { role: "assistant", content: "" };
                    if (generation.content.parts[0]?.text) {
                        message = {
                            role: "assistant",
                            content: generation.content.parts[0]?.text,
                        };
                    } else if (generation.content.parts[0]?.functionCall) {
                        message = {
                            role: "assistant",
                            tool_calls: [
                                {
                                    id: crypto.randomUUID(),
                                    type: "function",
                                    index: 0,
                                    function: {
                                        name: generation.content.parts[0]
                                            ?.functionCall.name,
                                        arguments: JSON.stringify(
                                            generation.content.parts[0]
                                                ?.functionCall.args
                                        ),
                                    },
                                },
                            ],
                        };
                    }
                    return {
                        delta: message,
                        index: generation.index,
                        finish_reason: generation.finishReason,
                    };
                }) ?? [],
        })}` + "\n\n"
    );
};
