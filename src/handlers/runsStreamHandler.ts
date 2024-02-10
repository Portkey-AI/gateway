import { Context } from "hono";
import { retryRequest } from "./retryHandler";
import Providers from "../providers";
import { ANTHROPIC, MAX_RETRIES, HEADER_KEYS, RETRY_STATUS_CODES, POWERED_BY, RESPONSE_HEADER_KEYS, AZURE_OPEN_AI, CONTENT_TYPES } from "../globals";
import { fetchProviderOptionsFromConfig, responseHandler, tryProvidersInSequence, updateResponseHeaders } from "./handlerUtils";
import { getStreamingMode } from "../utils";
import { Config, ShortConfig } from "../types/requestBody";
import { env } from "hono/adapter"

// Find the proxy provider
function proxyProvider(headers:{[k: string]: string;}) {
  let proxyModeHeader = headers[HEADER_KEYS.MODE];
  let providerHeader = headers[HEADER_KEYS.PROVIDER];
  
  let configHeader = headers[HEADER_KEYS.CONFIG];
  let config;
  try { config = JSON.parse(configHeader) } catch (err) { /* Ignore */ }
  let configProvider = (config && 'provider' in config) ? config.provider : null;
  
  const proxyProvider = configProvider ?? proxyModeHeader?.split(" ")[1] ?? providerHeader;
  return proxyProvider;
}

function retryInfo(headers:{[k: string]: string;}) {
  let configHeader = headers[HEADER_KEYS.CONFIG];
  let config;
  try { config = JSON.parse(configHeader) } catch (err) { /* Ignore */ }
  let configRetry = (config && 'retry' in config && typeof config.retry === "object") ? config.retry : null;

  let retryHeader = headers[HEADER_KEYS.RETRIES] ? parseInt(headers[HEADER_KEYS.RETRIES]) : null

  let retryCount = Math.min((retryHeader ?? configRetry?.attempts ?? 1), MAX_RETRIES)
  let retryStatusCodes = configRetry?.onStatusCodes ?? RETRY_STATUS_CODES

  return {retryCount, retryStatusCodes}
}

function getProxyPath(requestURL:string, proxyProvider:string, proxyEndpointPath:string) {
  let reqURL = new URL(requestURL);
  let reqPath = reqURL.pathname;
  const reqQuery = reqURL.search;
  reqPath = reqPath.replace(proxyEndpointPath, "");
  const providerBasePath = Providers[proxyProvider].api.baseURL;
  if (proxyProvider === AZURE_OPEN_AI) {
    return `https:/${reqPath}${reqQuery}`;
  }
  let proxyPath = `${providerBasePath}${reqPath}${reqQuery}`;
  
  // Fix specific for Anthropic SDK calls. Is this needed? - Yes
  if (proxyProvider === ANTHROPIC) {
      proxyPath = proxyPath.replace("/v1/v1/", "/v1/");
  }

  return proxyPath;
}

async function getRequestData(request: Request, contentType: string) {
  let requestJSON: Record<string, any> = {};
  let requestFormData;
  let requestBody = "";

  if (contentType == CONTENT_TYPES.APPLICATION_JSON) {
    if (["GET", "DELETE"].includes(request.method)) {
      return [requestJSON, requestFormData]
    }
    requestBody = await request.text();
    requestJSON = JSON.parse(requestBody);
  } else if (contentType == CONTENT_TYPES.MULTIPART_FORM_DATA) {
    requestFormData = await request.formData();
    requestFormData.forEach(function (value, key) {
      requestJSON[key] = value;
    });
  }

  return [requestJSON, requestFormData];
}

function headersToSend(headersObj: Record<string, string>, customHeadersToIgnore: Array<string>): Record<string, string> {
  let final: Record<string, string> = {};
  const poweredByHeadersPattern = `x-${POWERED_BY}-`;
  const headersToAvoid = [...customHeadersToIgnore];
  if (headersObj["content-type"]?.split(";")[0] === CONTENT_TYPES.MULTIPART_FORM_DATA) {
    headersToAvoid.push("content-type");
  }
  headersToAvoid.push("content-length");
  Object.keys(headersObj).forEach((key: string) => {
    if (!headersToAvoid.includes(key) && !key.startsWith(poweredByHeadersPattern)) {
      final[key] = headersObj[key];
    }
  });

  return final;
}

// SSE Functions
const sendEvent = (data: any, eventName:string|null = null, writer:WritableStreamDefaultWriter<any>, encoder: TextEncoder) => {
  let message = '';
  if (eventName) {
    message += `event: ${eventName}\n`;
  }
  message += `data: ${JSON.stringify(data)}\n\n`;
  writer.write(encoder.encode(message));
};

const initiateRun = async (urlToFetch:string, fetchOptions:any) => {
  try {
    const response = await fetch(urlToFetch, fetchOptions);
    const data: any = await response.json();
    const run_id = data.id;
    const thread_id = data.thread_id;
    return {data,run_id,thread_id};
  } catch (error) {
    console.error('Error initiating run:', error);
    return null;
  }
};

const getRun = async (basePath:string, runId:string, threadId:string, headers:any) => {
  let url = `${basePath}/${threadId}/runs/${runId}`;

  const response = await fetch(url, {headers});
  const data: any = await response.json();

  return data;
}

const getSteps = async (basePath:string, runId:string, threadId:string, headers:any, lastStepRecd:string) => {
  let url = `${basePath}/${threadId}/runs/${runId}/steps?before=${lastStepRecd}`;

  const response = await fetch(url, {headers});
  const data: any = await response.json();

  return data.data;
}

const getMessages = async (basePath:string, runId:string, threadId:string, headers:any, lastMessageRecd:string) => {
  let url = `${basePath}/${threadId}/messages?before=${lastMessageRecd}`;

  const response = await fetch(url, {headers});
  const data: any = await response.json();

  return data.data;
}

export async function runsStreamHandler(c: Context): Promise < Response > {
  try {
    const requestHeaders = Object.fromEntries(c.req.raw.headers);
    const requestContentType = requestHeaders["content-type"]?.split(";")[0];
    const [requestJSON, requestFormData] = await getRequestData(c.req.raw, requestContentType);

    const store: Record < string, any > = {
      proxyProvider: proxyProvider(requestHeaders),
      reqBody: requestJSON,
      requestFormData: requestFormData,
      customHeadersToAvoid: env(c).CUSTOM_HEADERS_TO_IGNORE??[],
      proxyPath: "/v1"
    }

    let urlToFetch = getProxyPath(c.req.url, store.proxyProvider, store.proxyPath);
    store.isStreamingMode = getStreamingMode(store.reqBody, store.proxyProvider, urlToFetch)

    // NOT SUPPORTING CONFIGS FOR STREAMING RUNS
    // if (requestConfig &&
    //   (
    //     ("options" in requestConfig && requestConfig.options) ||
    //     ("targets" in requestConfig && requestConfig.targets) ||
    //     ("provider" in requestConfig && requestConfig.provider)
    //   )
    // ) {
    //   let  providerOptions = fetchProviderOptionsFromConfig(requestConfig);

    //   if (!providerOptions) {
    //     return new Response(JSON.stringify({
    //       status: "failure",
    //       message: "Could not find a provider option."
    //       }), {
    //         status: 400,
    //         headers: {
    //             "content-type": "application/json"
    //         }
    //     });
    //   }


    //   providerOptions = providerOptions.map(po => ({
    //     ...po, 
    //     urlToFetch
    //   }))

    //   try {
    //       return await tryProvidersInSequence(c, providerOptions, store.reqBody, requestHeaders, "proxy");
    //   } catch (error:any) {
    //     const errorArray = JSON.parse(error.message);
    //     return new Response(errorArray[errorArray.length - 1].errorObj, {
    //       status: errorArray[errorArray.length - 1].status,
    //       headers: {
    //           "content-type": "application/json"
    //       }
    //     });
    //   }
    // }

    // We're not retrying these for now
    // let {retryCount, retryStatusCodes} = retryInfo(requestHeaders);

    // DO NOT CACHE THIS REQUEST
    // const getFromCacheFunction = c.get('getFromCache');
    // const cacheIdentifier = c.get('cacheIdentifier');

    let cacheResponse, cacheKey;
    let cacheStatus = "DISABLED";
    let cacheMode = requestHeaders[HEADER_KEYS.CACHE];

    // if (requestConfig?.cache && typeof requestConfig.cache === "object" && requestConfig.cache.mode) {
    //   cacheMode = requestConfig.cache.mode;
    // } else if (requestConfig?.cache && typeof requestConfig.cache === "string") {
    //   cacheMode = requestConfig.cache
    // }

    // if (getFromCacheFunction && cacheMode) {
    //   [cacheResponse, cacheStatus, cacheKey] = await getFromCacheFunction(env(c), {...requestHeaders, ...fetchOptions.headers}, store.reqBody, urlToFetch, cacheIdentifier, cacheMode);
    //   if (cacheResponse) {
    //     const cacheMappedResponse = await responseHandler(new Response(cacheResponse, {headers: {
    //       "content-type": "application/json"
    //     }}), false, store.proxyProvider, undefined, urlToFetch);
    //     c.set("requestOptions", [{
    //       providerOptions: {...store.reqBody, provider: store.proxyProvider, requestURL: urlToFetch, rubeusURL: 'proxy'},
    //       requestParams: store.reqBody,
    //       response: cacheMappedResponse.clone(),
    //       cacheStatus: cacheStatus,
    //       cacheKey: cacheKey,
    //       cacheMode: cacheMode
    //     }])
    //     updateResponseHeaders(cacheMappedResponse, 0, store.reqBody, cacheStatus, 0, requestHeaders[HEADER_KEYS.TRACE_ID] ?? "");
    //     return cacheMappedResponse;
    //   }
    // }



    // Assuming `fetchOptions`, `urlToFetch`, and `store` are defined as in your snippet

    let fetchOptions = {
      headers: headersToSend(requestHeaders, store.customHeadersToAvoid),
      method: c.req.method,
      body: JSON.stringify(store.reqBody)
    };

    let runBasePath = urlToFetch.split(`${c.req.param('thread_id') ?? ""}/runs/stream`)[0];
    let lastMessageRecd: string = "";
    let lastStepRecd: string = "";
    let runMessages: any = [];
    let runSteps: any = [];
    let finalRunObj: any = {};
    let intervalId:any;

    // Use TransformStream for handling SSE
    const {
      readable,
      writable
    } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Function to poll APIs and send updates
    const pollAndUpdate = async (run_id: string, thread_id: string) => {
      try {
        let steps = await getSteps(runBasePath, run_id, thread_id, fetchOptions.headers, lastStepRecd);
        let completedSteps = steps.filter((s: { status: string; }) => ['completed', 'cancelled', 'failed', 'expired'].includes(s.status))
        if (completedSteps.length) {
          sendEvent(completedSteps, null, writer, encoder);
          lastStepRecd = completedSteps[0].id
          runSteps.push(...completedSteps)
        }

        let messages = await getMessages(runBasePath, run_id, thread_id, fetchOptions.headers, lastMessageRecd);
        let contentMessages = messages.filter((m: { content: any; }) => !!m.content);
        if (contentMessages.length && !!contentMessages[0].id) {
          sendEvent(contentMessages, null, writer, encoder);
          runMessages.push(...contentMessages);
          lastMessageRecd = contentMessages[0].id
        }

        let run = await getRun(runBasePath, run_id, thread_id, fetchOptions.headers);
        if (['completed', 'cancelled', 'failed', 'expired', 'requires_action'].includes(run.status)) {
          finalRunObj = run;
          finalRunObj.messages = runMessages;
          finalRunObj.steps = runSteps;

          clearInterval(intervalId)
          writer.close(); // Close the stream
        }
      } catch (err) {
        console.error(`Error fetching data:`, err);
        sendEvent({error: `Error fetching data`}, 'error', writer, encoder);
      }
    };

    // Main logic to start the process and periodically poll for updates
    (async () => {
      const initiationResult = await initiateRun(urlToFetch.split("/stream")[0], fetchOptions);
      if (initiationResult) {
        sendEvent(initiationResult.data, null, writer, encoder); // Send the initiation data as the first SSE event
        // Setup periodic polling for updates
        pollAndUpdate(initiationResult.run_id, initiationResult.thread_id)
        intervalId = setInterval(() => pollAndUpdate(initiationResult.run_id, initiationResult.thread_id), 5000);

        // Additional logic to handle cleanup or stream closing can be added here if needed
      } else {
        sendEvent({error: 'Failed to initiate run'}, 'error', writer, encoder);
        writer.close(); // Close the stream if initiation fails
      }
    })();

    c.set("requestOptions", [{
      providerOptions: {
        ...store.reqBody,
        provider: store.proxyProvider,
        requestURL: urlToFetch,
        rubeusURL: 'proxy'
      },
      requestParams: store.reqBody,
      response: finalRunObj,
      cacheStatus: cacheStatus,
      cacheKey: cacheKey,
      cacheMode: cacheMode
    }])

    // Return SSE headers with the readable stream from TransformStream
    return c.body(readable, 200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  } catch (err: any) {
    // console.error("proxy error", err.message);
    return new Response(
      JSON.stringify({
        status: "failure",
        message: "Something went wrong",
      }), {
        status: 500,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }
}
