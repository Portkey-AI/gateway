import { AZURE_OPEN_AI } from "../globals";
import { getStreamModeSplitPattern } from "../utils";

export async function* readStream(reader: ReadableStreamDefaultReader, splitPattern: string, transformFunction: Function | undefined, isSleepTimeRequired: boolean) {
    let buffer = '';
    let decoder = new TextDecoder();
    let isFirstChunk = true;

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            if (buffer.length > 0) {
                if (transformFunction) {
                    yield transformFunction(buffer);
                } else {
                    yield buffer
                }
            }
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        // keep buffering until we have a complete chunk

        while (buffer.split(splitPattern).length > 1) {
            let parts = buffer.split(splitPattern);
            let lastPart = parts.pop() ?? "";  // remove the last part from the array and keep it in buffer
            for (let part of parts) {
                // Some providers send ping event which can be ignored during parsing
                if (part.startsWith("event: ping")) {
                    continue;
                }
                if (part.length > 0) {
                    if (isFirstChunk) {
                        isFirstChunk = false;
                        await new Promise(resolve => setTimeout(resolve, 25));
                    } else if (isSleepTimeRequired) {
                        await new Promise(resolve => setTimeout(resolve, 1));
                    }

                    if (transformFunction) {
                        yield transformFunction(part);
                    } else {
                        yield part + splitPattern;
                    }
                }
            }
            
            buffer = lastPart;  // keep the last part (after the last '\n\n') in buffer
        }
    }
}

export async function handleNonStreamingMode(response: Response, responseTransformer: Function | undefined) {
    let responseBodyJson = await response.json();
    if (responseTransformer) {
        responseBodyJson = responseTransformer(responseBodyJson, response.status);
    }

    return new Response(JSON.stringify(responseBodyJson), response);
}


export async function handleStreamingMode(response: Response, proxyProvider: string, responseTransformer: Function | undefined): Promise<Response> {
    const splitPattern = getStreamModeSplitPattern(proxyProvider);
    if (!response.body) {
        throw new Error("Response format is invalid. Body not found");
    }
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = response.body.getReader();
    const isSleepTimeRequired = proxyProvider === AZURE_OPEN_AI ? true : false;
    const encoder = new TextEncoder();

    (async () => {
        for await (const chunk of readStream(reader, splitPattern, responseTransformer, isSleepTimeRequired)) {
            await writer.write(encoder.encode(chunk));
        }
        writer.close();
    })()

    return new Response(readable, response);
}

