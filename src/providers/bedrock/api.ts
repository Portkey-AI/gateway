import { Options } from "../../types/requestBody";
import { ProviderAPIConfig } from "../types";
import { generateAWSHeaders } from "./utils";

const BedrockAPIConfig: ProviderAPIConfig = {
    getBaseURL: (REGION: string = "us-east-1") =>
        `https://bedrock-runtime.${REGION}.amazonaws.com`,
    headers: async (
        providerOption: Options,
        body: Record<string, any>,
        url: string
    ) => {
        const headers = {
            "content-type": "application/json",
        };

        return generateAWSHeaders(
            body,
            headers,
            url,
            "POST",
            "bedrock",
            providerOption.awsRegion || "",
            providerOption.awsAccessKeyId || "",
            providerOption.awsSecretAccessKey || "",
            providerOption.awsSessionToken || ""
        );
    },
    getEndpoint: (fn: string, model: string, stream: boolean) => {
        let mappedFn = fn;
        if (stream) {
            mappedFn = `stream-${fn}`;
        }
        const endpoint = `/model/${model}/invoke`;
        const streamEndpoint = `/model/${model}/invoke-with-response-stream`;
        switch (mappedFn) {
            case "chatComplete": {
                return endpoint;
            }
            case "stream-chatComplete": {
                return streamEndpoint;
            }
            case "complete": {
                return endpoint;
            }
            case "stream-complete": {
                return streamEndpoint;
            }
            case "embed": {
                return endpoint;
            }
            case "imageGenerate": {
                return endpoint;
            }
        }
    },
};

export default BedrockAPIConfig;
