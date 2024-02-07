import { Context } from "hono";
import { retryRequest } from "./retryHandler";
import Providers from "../providers";
import { ANTHROPIC, MAX_RETRIES, HEADER_KEYS, RETRY_STATUS_CODES, POWERED_BY, RESPONSE_HEADER_KEYS, AZURE_OPEN_AI, CONTENT_TYPES } from "../globals";
import { fetchProviderOptionsFromConfig, responseHandler, tryProvidersInSequence, updateResponseHeaders } from "./handlerUtils";
import { getStreamingMode } from "../utils";
import { Config, ShortConfig } from "../types/requestBody";
import { env } from "hono/adapter"
// Find the proxy provider
function proxyProvider(proxyModeHeader:string, providerHeader: string) {
  const proxyProvider = proxyModeHeader?.split(" ")[1] ?? providerHeader;
  return proxyProvider;
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

export async function runsStreamHandler(c: Context): Promise < Response > {
  try {
    const requestHeaders = Object.fromEntries(c.req.raw.headers);
    const requestContentType = requestHeaders["content-type"]?.split(";")[0];
    const [requestJSON, requestFormData] = await getRequestData(c.req.raw, requestContentType);

    const store: Record < string, any > = {
      proxyProvider: proxyProvider(requestHeaders[HEADER_KEYS.MODE], requestHeaders[`x-${POWERED_BY}-provider`]),
      reqBody: requestJSON,
      requestFormData: requestFormData,
      customHeadersToAvoid: env(c).CUSTOM_HEADERS_TO_IGNORE??[],
      proxyPath: c.req.url.indexOf("/v1/proxy") > -1 ? "/v1/proxy" : "/v1"
    }

    let requestConfig: Config | ShortConfig | null = null;
    if (requestHeaders[`x-${POWERED_BY}-config`]) {
      requestConfig = JSON.parse(requestHeaders[`x-${POWERED_BY}-config`]);
      if (requestConfig && 'provider' in requestConfig) {
        store.proxyProvider = requestConfig.provider;
      }
    };

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

    let retryCount = 0;
    let retryStatusCodes = RETRY_STATUS_CODES;
    if (requestHeaders[HEADER_KEYS.RETRIES]) {
      retryCount = parseInt(requestHeaders[HEADER_KEYS.RETRIES]);
    } else if (requestConfig?.retry && typeof requestConfig.retry === "object") {
      retryCount = requestConfig.retry?.attempts??1,
        retryStatusCodes = requestConfig.retry?.onStatusCodes??RETRY_STATUS_CODES
    }

    retryCount = Math.min(retryCount, MAX_RETRIES);

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

    let runBasePath = urlToFetch.split('/runs/stream')[0];
    let lastMessageRecd: string = "";
    let lastStepRecd: string = "";
    let runMessages: any = [];
    let runSteps: any = [];
    let finalRunObj: any = {};

    // Use TransformStream for handling SSE
    const {
      readable,
      writable
    } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Function to initiate run and send first event
    const initiateRun = async () => {
      try {
        const response = await fetch(`${runBasePath}/runs`, fetchOptions);
        const data: any = await response.json();
        const run_id = data.id;
        const thread_id = data.thread_id;
        return {data,run_id,thread_id};
      } catch (error) {
        console.error('Error initiating run:', error);
        return null;
      }
    };

    // Function to send SSE data
    const sendEvent = (data: any, eventName = null) => {
      let message = '';
      if (eventName) {
        message += `event: ${eventName}\n`;
      }
      message += `data: ${JSON.stringify(data)}\n\n`;
      writer.write(encoder.encode(message));
    };

    // Function to poll APIs and send updates
    const pollAndUpdate = async (run_id: string, thread_id: string) => {
      const urls = [
        `${runBasePath}/${thread_id}/runs/${run_id}/steps?before=${lastStepRecd}`,
        `${runBasePath}/${thread_id}/messages?before=${lastMessageRecd}`,
        `${runBasePath}/${thread_id}/runs/${run_id}`,
      ];

      for (const url of urls) {
        try {
          const response = await fetch(url, {
            headers: fetchOptions.headers
          });
          const data: any = await response.json();
          sendEvent(data);

          if (url === `${runBasePath}/${thread_id}/messages?before=${lastMessageRecd}`) {
            let messages = data.data;
            // console.log(JSON.stringify(messages.map(d => d.content[0]?.text?.value).filter(d => !!d)));
            if (messages.length && !!messages[messages.length - 1].id) {
              let msgsToPush = messages.filter(m => !!m.content)
              runMessages.push(...msgsToPush);
              lastMessageRecd = messages[messages.length - 1].id
            }
          }

          if (url === `${runBasePath}/${thread_id}/runs/${run_id}/steps?before=${lastStepRecd}`) {
            let steps = data.data;
            // console.log(JSON.stringify(steps.map(d => d.step_details).filter(d => !!d)));
            let completedSteps = steps.filter(s => ['completed', 'cancelled', 'failed', 'expired'].includes(s.status))
            if (completedSteps.length) {
              lastStepRecd = completedSteps[0].id
              runSteps.push(...completedSteps)
            }
          }

          // Check if the run is completed, cancelled, failed, or expired
          if (url === `${runBasePath}/${thread_id}/runs/${run_id}` && ['completed', 'cancelled', 'failed', 'expired'].includes(data.status)) {
            finalRunObj = data;
            finalRunObj.messages = runMessages;
            finalRunObj.steps = runSteps;

            console.log(JSON.stringify(finalRunObj))

            writer.close(); // Close the stream
            break; // Exit the loop
          }
        } catch (error) {
          console.error(`Error fetching data from ${url}:`, error);
          sendEvent({
            error: `Error fetching data from ${url}`
          });
        }
      }
    };

    // Main logic to start the process and periodically poll for updates
    (async () => {
      const initiationResult = await initiateRun();
      if (initiationResult) {
        sendEvent(initiationResult.data); // Send the initiation data as the first SSE event
        // Setup periodic polling for updates
        pollAndUpdate(initiationResult.run_id, initiationResult.thread_id)
        const intervalId = setInterval(() => pollAndUpdate(initiationResult.run_id, initiationResult.thread_id), 5000);

        // Additional logic to handle cleanup or stream closing can be added here if needed
      } else {
        sendEvent({
          error: 'Failed to initiate run'
        }, 'error');
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
