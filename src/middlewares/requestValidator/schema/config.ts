import { z } from "zod";
import {
    ANTHROPIC,
    ANYSCALE,
    AZURE_OPEN_AI,
    COHERE,
    GOOGLE,
    MISTRAL_AI,
    OPEN_AI,
    PERPLEXITY_AI,
    TOGETHER_AI,
    DEEPINFRA,
} from "../../../globals";

export const configSchema: any = z
    .object({
        strategy: z
            .object({
                mode: z
                    .string()
                    .refine(
                        (value) =>
                            ["single", "loadbalance", "fallback"].includes(
                                value
                            ),
                        {
                            message:
                                "Invalid 'mode' value. Must be one of: single, loadbalance, fallback",
                        }
                    ),
                on_status_codes: z.array(z.number()).optional(),
            })
            .optional(),
        provider: z
            .string()
            .refine(
                (value) =>
                    [
                        OPEN_AI,
                        ANTHROPIC,
                        AZURE_OPEN_AI,
                        ANYSCALE,
                        COHERE,
                        TOGETHER_AI,
                        GOOGLE,
                        PERPLEXITY_AI,
                        MISTRAL_AI,
                        DEEPINFRA
                    ].includes(value),
                {
                    message:
                        "Invalid 'provider' value. Must be one of: openai, anthropic, azure-openai, anyscale, cohere",
                }
            )
            .optional(),
        api_key: z.string().optional(),
        cache: z
            .object({
                mode: z
                    .string()
                    .refine((value) => ["simple", "semantic"].includes(value), {
                        message:
                            "Invalid 'cache.mode' value. Must be one of: simple, semantic",
                    }),
                max_age: z.number().optional(),
            })
            .refine((value) => value.mode !== undefined, {
                message: "'cache.mode' must be defined",
            })
            .optional(),
        retry: z
            .object({
                attempts: z.number(),
                on_status_codes: z.array(z.number()).optional(),
            })
            .refine((value) => value.attempts !== undefined, {
                message: "'retry.attempts' must be defined",
            })
            .optional(),
        weight: z.number().optional(),
        on_status_codes: z.array(z.number()).optional(),
        targets: z.array(z.lazy(() => configSchema)).optional(),
        request_timeout: z.number().optional(),
    })
    .refine(
        (value) => {
            const hasProviderApiKey =
                value.provider !== undefined && value.api_key !== undefined;
            const hasModeTargets =
                value.strategy !== undefined && value.targets !== undefined;
            return (
                hasProviderApiKey ||
                hasModeTargets ||
                value.cache ||
                value.retry ||
                value.request_timeout
            );
        },
        {
            message:
                "Invalid configuration. It must have either 'provider' and 'api_key', or 'strategy' and 'targets', or 'cache', or 'retry', or 'request_timeout'",
        }
    );
