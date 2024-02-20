import { AI21 } from "../../globals";
import { Params } from "../../types/requestBody";
import {
    ChatCompletionResponse,
    ErrorResponse,
    ProviderConfig,
} from "../types";
import { AI21ErrorResponse } from "./complete";

export const AI21ChatCompleteConfig: ProviderConfig = {
    messages: [
        {
            param: "messages",
            required: true,
            transform: (params: Params) => {
                let inputMessages: any = [];

                if (params.messages?.[0]?.role === "system") {
                    inputMessages = params.messages.slice(1);
                } else if (params.messages) {
                    inputMessages = params.messages;
                }

                return inputMessages.map((msg: any) => ({
                    text: msg.content,
                    role: msg.role,
                }));
            },
        },
        {
            param: "system",
            required: false,
            transform: (params: Params) => {
                if (params.messages?.[0].role === "system") {
                    return params.messages?.[0].content;
                }
            },
        },
    ],
    n: {
        param: "numResults",
        default: 1,
    },
    max_tokens: {
        param: "maxTokens",
        default: 16,
    },
    minTokens: {
        param: "minTokens",
        default: 0,
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
    top_k: {
        param: "topKReturn",
        default: 0,
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


interface AI21ChatCompleteResponse {
    id: string;
    outputs: {
      text: string;
      role: string;
      finishReason: {
        reason: string;
        length: number | null;
        sequence: string | null;
      }
    }[]
}

export const AI21ChatCompleteResponseTransform: (
    response: AI21ChatCompleteResponse | AI21ErrorResponse,
    responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && "detail" in response) {
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

    if ("outputs" in response) {
        return {
            id: response.id,
            object: "chat_completion",
            created: Math.floor(Date.now() / 1000),
            model: "",
            provider: AI21,
            choices: response.outputs.map((o, index) => ({
              message: {
                "role": "assistant",
                content: o.text
              },
              index: index,
              logprobs: null,
              finish_reason: o.finishReason?.reason,
            }))
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
