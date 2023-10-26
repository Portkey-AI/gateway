import { CompletionResponse, ErrorResponse, ProviderConfig } from '../types';

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const OllamaCompleteConfig: ProviderConfig = {
    model: {
        param: 'model',
        default: 'llama2',
        required: true,
    },
    prompt: {
        param: 'prompt',
        required: true,
    },
    stream: {
        param: 'stream',
        default: false,
        required: true,
    },
    temperature: {
        param: 'temperature',
        default: 0.8,
    },
    top_k: {
        param: 'top_k',
        default: 40,
    },
    top_p: {
        param: 'top_p',
        default: 0.9,
    },
};

interface OllamaCompleteResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    context: number[];
    total_duration: number;
    load_duration: number;
    prompt_eval_count: number;
    prompt_eval_duration: number;
    eval_count: number;
    eval_duration: number;
    error?: string;
}

export const OllamaCompleteResponseTransform: (
    response: OllamaCompleteResponse,
    responseStatus: number
) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200) {
        return {
            error: {
                message: response.error,
                type: null,
                param: null,
                code: null,
            },
            provider: 'ollama',
        } as ErrorResponse;
    }

    return {
        id: 'TODO: generate a unique id for this completion',
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: response.model,
        provider: 'ollama',
        choices: [
            {
                text: response.response,
                index: 0,
                logprobs: null,
                finish_reason: response.done ? 'length' : 'incomplete',
            },
        ],
    };
};

