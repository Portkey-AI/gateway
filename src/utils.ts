import { ANTHROPIC, COHERE } from "./globals";
import { Params } from "./types/requestBody";

export const getStreamModeSplitPattern = (proxyProvider: string) => {
    let splitPattern = '\n\n';
    if (proxyProvider === ANTHROPIC) {
        splitPattern = '\r\n\r\n'; 
    }
    if (proxyProvider === COHERE) {
        splitPattern = '\n';
    }
    return splitPattern;
}

export const getStreamingMode = (reqBody: Params) => {
    return reqBody.stream 
}