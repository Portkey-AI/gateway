import { BEDROCK } from "../../globals";
import { Message, Params } from "../../types/requestBody";
import {
    ChatCompletionResponse,
    CompletionResponse,
    ErrorResponse,
    ProviderConfig,
} from "../types";
import {
    BedrockAI21CompleteResponse,
    BedrockAnthropicCompleteResponse,
    BedrockAnthropicStreamChunk,
    BedrockCohereCompleteResponse,
    BedrockCohereStreamChunk,
    BedrockLlamaCompleteResponse,
    BedrockLlamaStreamChunk,
    BedrockTitanCompleteResponse,
    BedrockTitanStreamChunk,
} from "./complete";
import { BedrockErrorResponse } from "./embed";

export const BedrockAnthropicChatCompleteConfig: ProviderConfig = {
    messages: {
        param: "prompt",
        required: true,
        transform: (params: Params) => {
            let prompt: string = "";
            if (!!params.messages) {
                let messages: Message[] = params.messages;
                messages.forEach((msg, index) => {
                    if (index === 0 && msg.role === "system") {
                        prompt += `System: ${msg.content}\n`;
                    } else if (msg.role == "user") {
                        prompt += `\n\nHuman: ${msg.content}\n`;
                    } else if (msg.role == "assistant") {
                        prompt += `Assistant: ${msg.content}\n`;
                    } else {
                        prompt += `${msg.role}: ${msg.content}\n`;
                    }
                });
                prompt += "Assistant:";
            }
            return prompt;
        },
    },
    max_tokens: {
        param: "max_tokens_to_sample",
        required: true,
    },
    temperature: {
        param: "temperature",
        default: 1,
        min: 0,
        max: 1,
    },
    top_p: {
        param: "top_p",
        default: -1,
        min: -1,
    },
    top_k: {
        param: "top_k",
        default: -1,
    },
    stop: {
        param: "stop_sequences",
        transform: (params: Params) => {
            if (params.stop === null) {
                return [];
            }
            return params.stop;
        },
    },
    user: {
        param: "metadata.user_id",
    },
};

export const BedrockCohereChatCompleteConfig: ProviderConfig = {
    messages: {
        param: "prompt",
        required: true,
        transform: (params: Params) => {
            let prompt: string = "";
            if (!!params.messages) {
                let messages: Message[] = params.messages;
                messages.forEach((msg, index) => {
                    if (index === 0 && msg.role === "system") {
                        prompt += `system: ${messages}\n`;
                    } else if (msg.role == "user") {
                        prompt += `user: ${msg.content}\n`;
                    } else if (msg.role == "assistant") {
                        prompt += `assistant: ${msg.content}\n`;
                    } else {
                        prompt += `${msg.role}: ${msg.content}\n`;
                    }
                });
                prompt += "Assistant:";
            }
            return prompt;
        },
    },
    max_tokens: {
        param: "max_tokens",
        default: 20,
        min: 1,
    },
    temperature: {
        param: "temperature",
        default: 0.75,
        min: 0,
        max: 5,
    },
    top_p: {
        param: "p",
        default: 0.75,
        min: 0,
        max: 1,
    },
    top_k: {
        param: "k",
        default: 0,
        max: 500,
    },
    frequency_penalty: {
        param: "frequency_penalty",
        default: 0,
        min: 0,
        max: 1,
    },
    presence_penalty: {
        param: "presence_penalty",
        default: 0,
        min: 0,
        max: 1,
    },
    logit_bias: {
        param: "logit_bias",
    },
    n: {
        param: "num_generations",
        default: 1,
        min: 1,
        max: 5,
    },
    stop: {
        param: "end_sequences",
    },
    stream: {
        param: "stream",
    },
};

export const BedrockLLamaChatCompleteConfig: ProviderConfig = {
    messages: {
        param: "prompt",
        required: true,
        transform: (params: Params) => {
            let prompt: string = "";
            if (!!params.messages) {
                let messages: Message[] = params.messages;
                messages.forEach((msg, index) => {
                    if (index === 0 && msg.role === "system") {
                        prompt += `system: ${messages}\n`;
                    } else if (msg.role == "user") {
                        prompt += `user: ${msg.content}\n`;
                    } else if (msg.role == "assistant") {
                        prompt += `assistant: ${msg.content}\n`;
                    } else {
                        prompt += `${msg.role}: ${msg.content}\n`;
                    }
                });
                prompt += "Assistant:";
            }
            return prompt;
        },
    },
    max_tokens: {
        param: "max_gen_len",
        default: 512,
        min: 1,
        max: 2048,
    },
    temperature: {
        param: "temperature",
        default: 0.5,
        min: 0,
        max: 1,
    },
    top_p: {
        param: "top_p",
        default: 0.9,
        min: 0,
        max: 1,
    },
};

const transformTitanGenerationConfig = (params: Params) => {
    const generationConfig: Record<string, any> = {};
    if (params["temperature"]) {
        generationConfig["temperature"] = params["temperature"];
    }
    if (params["top_p"]) {
        generationConfig["topP"] = params["top_p"];
    }
    if (params["max_tokens"]) {
        generationConfig["maxTokenCount"] = params["max_tokens"];
    }
    if (params["stop"]) {
        generationConfig["stopSequences"] = params["stop"];
    }
    return generationConfig;
};

export const BedrockTitanChatompleteConfig: ProviderConfig = {
    messages: {
        param: "inputText",
        required: true,
        transform: (params: Params) => {
            let prompt: string = "";
            if (!!params.messages) {
                let messages: Message[] = params.messages;
                messages.forEach((msg, index) => {
                    if (index === 0 && msg.role === "system") {
                        prompt += `system: ${messages}\n`;
                    } else if (msg.role == "user") {
                        prompt += `user: ${msg.content}\n`;
                    } else if (msg.role == "assistant") {
                        prompt += `assistant: ${msg.content}\n`;
                    } else {
                        prompt += `${msg.role}: ${msg.content}\n`;
                    }
                });
                prompt += "Assistant:";
            }
            return prompt;
        },
    },
    temperature: {
        param: "textGenerationConfig",
        transform: (params: Params) => transformTitanGenerationConfig(params),
    },
    max_tokens: {
        param: "textGenerationConfig",
        transform: (params: Params) => transformTitanGenerationConfig(params),
    },
    top_p: {
        param: "textGenerationConfig",
        transform: (params: Params) => transformTitanGenerationConfig(params),
    },
};

export const BedrockAI21ChatCompleteConfig: ProviderConfig = {
    messages: {
        param: "prompt",
        required: true,
        transform: (params: Params) => {
            let prompt: string = "";
            if (!!params.messages) {
                let messages: Message[] = params.messages;
                messages.forEach((msg, index) => {
                    if (index === 0 && msg.role === "system") {
                        prompt += `system: ${messages}\n`;
                    } else if (msg.role == "user") {
                        prompt += `user: ${msg.content}\n`;
                    } else if (msg.role == "assistant") {
                        prompt += `assistant: ${msg.content}\n`;
                    } else {
                        prompt += `${msg.role}: ${msg.content}\n`;
                    }
                });
                prompt += "Assistant:";
            }
            return prompt;
        },
    },
    max_tokens: {
        param: "maxTokens",
        default: 200,
    },
    temperature: {
        param: "temperature",
        default: 0.7,
        min: 0,
        max: 1,
    },
    top_p: {
        param: "topP",
        default: 1,
    },
    stop: {
        param: "stopSequences",
    },
    presence_penalty: {
        param: "presencePenalty",
        transform: (params: Params) => {
            return {
                scale: params.presence_penalty,
            };
        },
    },
    frequency_penalty: {
        param: "frequencyPenalty",
        transform: (params: Params) => {
            return {
                scale: params.frequency_penalty,
            };
        },
    },
    countPenalty: {
        param: "countPenalty",
    },
    frequencyPenalty: {
        param: "frequencyPenalty",
    },
    presencePenalty: {
        param: "presencePenalty",
    },
};

export const BedrockLlamaChatCompleteResponseTransform: (
    response: BedrockLlamaCompleteResponse | BedrockErrorResponse,
    responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
    if ("message" in response && responseStatus !== 200) {
        return {
            error: {
                message: response.message,
                type: null,
                param: null,
                code: null,
            },
            provider: BEDROCK,
        } as ErrorResponse;
    }

    if ("generation" in response) {
        return {
            id: Date.now().toString(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: BEDROCK,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: response.generation,
                    },
                    finish_reason: response.stop_reason,
                },
            ],
            usage: {
                prompt_tokens: response.prompt_token_count,
                completion_tokens: response.generation_token_count,
                total_tokens:
                    response.prompt_token_count +
                    response.generation_token_count,
            },
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

export const BedrockLlamaChatCompleteStreamChunkTransform: (
    response: string,
    fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
    let chunk = responseChunk.trim();
    chunk = chunk.trim();
    const parsedChunk: BedrockLlamaStreamChunk = JSON.parse(chunk);

    if (parsedChunk.stop_reason) {
        return [
            `data: ${JSON.stringify({
                id: fallbackId,
                object: "text_completion",
                created: Math.floor(Date.now() / 1000),
                model: "",
                provider: BEDROCK,
                choices: [
                    {
                        delta: {},
                        index: 0,
                        logprobs: null,
                        finish_reason: parsedChunk.stop_reason,
                    },
                ],
                usage: {
                    prompt_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .inputTokenCount,
                    completion_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .outputTokenCount,
                    total_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .inputTokenCount +
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .outputTokenCount,
                },
            })}\n\n`,
            `data: [DONE]\n\n`,
        ];
    }

    return `data: ${JSON.stringify({
        id: fallbackId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "",
        provider: BEDROCK,
        choices: [
            {
                index: 0,
                delta: {
                    role: "assistant",
                    content: parsedChunk.generation,
                },
                finish_reason: null,
            },
        ],
    })}\n\n`;
};

export const BedrockTitanChatCompleteResponseTransform: (
    response: BedrockTitanCompleteResponse | BedrockErrorResponse,
    responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
    if ("message" in response && responseStatus !== 200) {
        return {
            error: {
                message: response.message,
                type: null,
                param: null,
                code: null,
            },
            provider: BEDROCK,
        } as ErrorResponse;
    }

    if ("results" in response) {
        const completionTokens = response.results
            .map((r) => r.tokenCount)
            .reduce((partialSum, a) => partialSum + a, 0);
        return {
            id: Date.now().toString(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: BEDROCK,
            choices: response.results.map((generation, index) => ({
                index: index,
                message: {
                    role: "assistant",
                    content: generation.outputText,
                },
                finish_reason: generation.completionReason,
            })),
            usage: {
                prompt_tokens: response.inputTextTokenCount,
                completion_tokens: completionTokens,
                total_tokens: response.inputTextTokenCount + completionTokens,
            },
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

export const BedrockTitanChatCompleteStreamChunkTransform: (
    response: string,
    fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
    let chunk = responseChunk.trim();
    chunk = chunk.trim();
    const parsedChunk: BedrockTitanStreamChunk = JSON.parse(chunk);

    return [
        `data: ${JSON.stringify({
            id: fallbackId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: BEDROCK,
            choices: [
                {
                    index: 0,
                    delta: {
                        role: "assistant",
                        content: parsedChunk.outputText,
                    },
                    finish_reason: null,
                },
            ],
        })}\n\n`,
        `data: ${JSON.stringify({
            id: fallbackId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: BEDROCK,
            choices: [
                {
                    index: 0,
                    delta: {},
                    finish_reason: parsedChunk.completionReason,
                },
            ],
            usage: {
                prompt_tokens:
                    parsedChunk["amazon-bedrock-invocationMetrics"]
                        .inputTokenCount,
                completion_tokens:
                    parsedChunk["amazon-bedrock-invocationMetrics"]
                        .outputTokenCount,
                total_tokens:
                    parsedChunk["amazon-bedrock-invocationMetrics"]
                        .inputTokenCount +
                    parsedChunk["amazon-bedrock-invocationMetrics"]
                        .outputTokenCount,
            },
        })}\n\n`,
        `data: [DONE]\n\n`,
    ];
};

export const BedrockAI21ChatCompleteResponseTransform: (
    response: BedrockAI21CompleteResponse | BedrockErrorResponse,
    responseStatus: number,
    responseHeaders: Headers
) => ChatCompletionResponse | ErrorResponse = (
    response,
    responseStatus,
    responseHeaders
) => {
    if ("message" in response && responseStatus !== 200) {
        return {
            error: {
                message: response.message,
                type: null,
                param: null,
                code: null,
            },
            provider: BEDROCK,
        } as ErrorResponse;
    }

    if ("completions" in response) {
        const prompt_tokens =
            Number(responseHeaders.get("X-Amzn-Bedrock-Input-Token-Count")) ||
            0;
        const completion_tokens =
            Number(responseHeaders.get("X-Amzn-Bedrock-Output-Token-Count")) ||
            0;
        return {
            id: response.id.toString(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: BEDROCK,
            choices: response.completions.map((completion, index) => ({
                index: index,
                message: {
                    role: "assistant",
                    content: completion.data.text,
                },
                finish_reason: completion.finishReason?.reason,
            })),
            usage: {
                prompt_tokens: prompt_tokens,
                completion_tokens: completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
            },
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

export const BedrockAnthropicChatCompleteResponseTransform: (
    response: BedrockAnthropicCompleteResponse | BedrockErrorResponse,
    responseStatus: number,
    responseHeaders: Headers
) => ChatCompletionResponse | ErrorResponse = (
    response,
    responseStatus,
    responseHeaders
) => {
    if ("message" in response && responseStatus !== 200) {
        return {
            error: {
                message: response.message,
                type: "",
                param: null,
                code: null,
            },
            provider: BEDROCK,
        } as ErrorResponse;
    }

    if ("completion" in response) {
        const prompt_tokens =
            Number(responseHeaders.get("X-Amzn-Bedrock-Input-Token-Count")) ||
            0;
        const completion_tokens =
            Number(responseHeaders.get("X-Amzn-Bedrock-Output-Token-Count")) ||
            0;
        return {
            id: Date.now().toString(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: BEDROCK,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: response.completion,
                    },
                    finish_reason: response.stop_reason,
                },
            ],
            usage: {
                prompt_tokens: prompt_tokens,
                completion_tokens: completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
            },
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

export const BedrockAnthropicChatCompleteStreamChunkTransform: (
    response: string,
    fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
    let chunk = responseChunk.trim();

    const parsedChunk: BedrockAnthropicStreamChunk = JSON.parse(chunk);
    if (parsedChunk.stop_reason) {
        return [
            `data: ${JSON.stringify({
                id: fallbackId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: "",
                provider: BEDROCK,
                choices: [
                    {
                        index: 0,
                        delta: {
                            role: "assistant",
                            content: parsedChunk.completion,
                        },
                        finish_reason: null,
                    },
                ],
            })}\n\n`,
            `data: ${JSON.stringify({
                id: fallbackId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: "",
                provider: BEDROCK,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: parsedChunk.stop_reason,
                    },
                ],
                usage: {
                    prompt_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .inputTokenCount,
                    completion_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .outputTokenCount,
                    total_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .inputTokenCount +
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .outputTokenCount,
                },
            })}\n\n`,
            `data: [DONE]\n\n`,
        ];
    }

    return `data: ${JSON.stringify({
        id: fallbackId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "",
        provider: BEDROCK,
        choices: [
            {
                index: 0,
                delta: {
                    role: "assistant",
                    content: parsedChunk.completion,
                },
                finish_reason: null,
            },
        ],
    })}\n\n`;
};

export const BedrockCohereChatCompleteResponseTransform: (
    response: BedrockCohereCompleteResponse | BedrockErrorResponse,
    responseStatus: number,
    responseHeaders: Headers
) => ChatCompletionResponse | ErrorResponse = (
    response,
    responseStatus,
    responseHeaders
) => {
    if ("message" in response && responseStatus !== 200) {
        return {
            error: {
                message: response.message,
                type: null,
                param: null,
                code: null,
            },
            provider: BEDROCK,
        } as ErrorResponse;
    }

    if ("generations" in response) {
        const prompt_tokens =
            Number(responseHeaders.get("X-Amzn-Bedrock-Input-Token-Count")) ||
            0;
        const completion_tokens =
            Number(responseHeaders.get("X-Amzn-Bedrock-Output-Token-Count")) ||
            0;
        return {
            id: Date.now().toString(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: BEDROCK,
            choices: response.generations.map((generation, index) => ({
                index: index,
                message: {
                    role: "assistant",
                    content: generation.text,
                },
                finish_reason: generation.finish_reason,
            })),
            usage: {
                prompt_tokens: prompt_tokens,
                completion_tokens: completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
            },
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

export const BedrockCohereChatCompleteStreamChunkTransform: (
    response: string,
    fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
    let chunk = responseChunk.trim();
    chunk = chunk.replace(/^data: /, "");
    chunk = chunk.trim();
    const parsedChunk: BedrockCohereStreamChunk = JSON.parse(chunk);

    // discard the last cohere chunk as it sends the whole response combined.
    if (parsedChunk.is_finished) {
        return [
            `data: ${JSON.stringify({
                id: fallbackId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: "",
                provider: BEDROCK,
                choices: [
                    {
                        index: parsedChunk.index ?? 0,
                        delta: {},
                        finish_reason: parsedChunk.finish_reason,
                    },
                ],
                usage: {
                    prompt_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .inputTokenCount,
                    completion_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .outputTokenCount,
                    total_tokens:
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .inputTokenCount +
                        parsedChunk["amazon-bedrock-invocationMetrics"]
                            .outputTokenCount,
                },
            })}\n\n`,
            `data: [DONE]\n\n`,
        ];
    }

    return `data: ${JSON.stringify({
        id: fallbackId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "",
        provider: BEDROCK,
        choices: [
            {
                index: parsedChunk.index ?? 0,
                delta: {
                    role: "assistant",
                    content: parsedChunk.text,
                },
                finish_reason: null,
            },
        ],
    })}\n\n`;
};
