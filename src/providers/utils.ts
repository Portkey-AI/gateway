import { ErrorResponse } from "./types";

export const generateInvalidProviderResponseError: (
    response: Record<string, any>,
    provider: string
) => ErrorResponse = (response, provider) => {
    return {
        error: {
            message: `Invalid response recieved from ${provider}: ${JSON.stringify(
                response
            )}`,
            type: null,
            param: null,
            code: null,
        },
        provider: provider,
    } as ErrorResponse;
};
