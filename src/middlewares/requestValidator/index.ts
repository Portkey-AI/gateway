import { Context } from "hono";
import {
    ANTHROPIC,
    ANYSCALE,
    AZURE_OPEN_AI,
    COHERE,
    CONTENT_TYPES,
    GOOGLE,
    MISTRAL_AI,
    OPEN_AI,
    PALM,
    PERPLEXITY_AI,
    POWERED_BY,
    TOGETHER_AI,
    DEEPINFRA,
} from "../../globals";
import { configSchema } from "./schema/config";

export const requestValidator = (c: Context, next: any) => {
    const requestHeaders = Object.fromEntries(c.req.raw.headers);

    if (
        requestHeaders["content-type"] &&
        ![
            CONTENT_TYPES.APPLICATION_JSON,
            CONTENT_TYPES.MULTIPART_FORM_DATA,
        ].includes(requestHeaders["content-type"].split(";")[0])
    ) {
        return new Response(
            JSON.stringify({
                status: "failure",
                message: `Invalid content type passed`,
            }),
            {
                status: 400,
                headers: {
                    "content-type": "application/json",
                },
            }
        );
    }

    if (
        !(
            requestHeaders[`x-${POWERED_BY}-config`] ||
            requestHeaders[`x-${POWERED_BY}-provider`]
        )
    ) {
        return new Response(
            JSON.stringify({
                status: "failure",
                message: `Either x-${POWERED_BY}-config or x-${POWERED_BY}-provider header is required`,
            }),
            {
                status: 400,
                headers: {
                    "content-type": "application/json",
                },
            }
        );
    }
    if (
        requestHeaders[`x-${POWERED_BY}-provider`] &&
        ![OPEN_AI, AZURE_OPEN_AI, COHERE, ANTHROPIC, ANYSCALE, PALM, TOGETHER_AI, GOOGLE, MISTRAL_AI, PERPLEXITY_AI, DEEPINFRA].includes(
            requestHeaders[`x-${POWERED_BY}-provider`]
        )
    ) {
        return new Response(
            JSON.stringify({
                status: "failure",
                message: `Invalid provider passed`,
            }),
            {
                status: 400,
                headers: {
                    "content-type": "application/json",
                },
            }
        );
    }


    if (requestHeaders[`x-${POWERED_BY}-config`]) {
        try {
            const parsedConfig = JSON.parse(
                requestHeaders[`x-${POWERED_BY}-config`]
            );
            if (!requestHeaders[`x-${POWERED_BY}-provider`] && !(parsedConfig.provider || parsedConfig.targets)) {
                return new Response(
                    JSON.stringify({
                        status: "failure",
                        message: `Either x-${POWERED_BY}-provider needs to be passed. Or the x-${POWERED_BY}-config header should have a valid config with provider details in it.`,
                    }),
                    {
                        status: 400,
                        headers: {
                            "content-type": "application/json",
                        },
                    }
                );
            }

            const validatedConfig = configSchema.safeParse(parsedConfig);

            if (
                !validatedConfig.success &&
                validatedConfig.error?.issues?.length
            ) {
                return new Response(
                    JSON.stringify({
                        status: "failure",
                        message: `Invalid config passed`,
                        errors: validatedConfig.error.issues.map(
                            (e: any) => `path: ${e.path}, message: ${e.message}`
                        ),
                    }),
                    {
                        status: 400,
                        headers: {
                            "content-type": "application/json",
                        },
                    }
                );
            }

            if (parsedConfig.options) {
                return new Response(
                    JSON.stringify({
                        status: "failure",
                        message: `This version of config is not supported in this route. Please migrate to the latest version`,
                    }),
                    {
                        status: 400,
                        headers: {
                            "content-type": "application/json",
                        },
                    }
                );
            }
        } catch (e) {
            return new Response(
                JSON.stringify({
                    status: "failure",
                    message: `Invalid config passed. You need to pass a valid json`,
                }),
                {
                    status: 400,
                    headers: {
                        "content-type": "application/json",
                    },
                }
            );
        }
    }
    return next();
};
