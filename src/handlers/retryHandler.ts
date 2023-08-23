import retry from 'async-retry';

/**
 * Tries making a fetch request a specified number of times until it succeeds.
 * If the response's status code is included in the statusCodesToRetry array,
 * the request is retried.
 *
 * @param {string} url - The URL to which the request is made.
 * @param {RequestInit} options - The options for the request, such as method, headers, and body.
 * @param {number} retryCount - The maximum number of times to retry the request.
 * @param {number[]} statusCodesToRetry - The HTTP status codes that should trigger a retry.
 * @returns {Promise<[Response, number | undefined]>} - The response from the request and the number of attempts it took to get a successful response. 
 *                                                     If all attempts fail, the error message and status code are returned as a Response object, and the number of attempts is undefined.
 * @throws Will throw an error if the request fails after all retry attempts, with the error message and status code in the thrown error.
 */
export const retryRequest = async (
  url: string,
  options: RequestInit,
  retryCount: number,
  statusCodesToRetry: number[]
): Promise<[Response, number | undefined]> => {

  let lastError: any | undefined;
  let lastResponse: Response | undefined;
  let lastAttempt: number | undefined;
  try {
    await retry(
      async (bail: any, attempt: number) => {
        try {
          const response: Response = await fetch(url, options);
          if (statusCodesToRetry.includes(response.status)) {
            const errorObj: any = new Error(await response.text());
            errorObj.status = response.status;
            throw errorObj;
          } else if (response.status>=200 && response.status<=204) {
            lastAttempt = attempt;
            console.log(`Returned in Retry Attempt ${attempt}. Status:`, response.ok, response.status);
          } else {
            // All error codes that aren't retried need to be propogated up
            lastAttempt = attempt;
            const errorObj:any = new Error(await response.clone().text());
            errorObj.status = response.status;
            bail(errorObj);
            return;
          }
          lastResponse = response;
        } catch (error: any) {
          lastError = error;
          if (attempt >= retryCount + 1) {
            bail(error);
            return;
          }
          throw error;
        }
      }, {
      retries: retryCount,
      onRetry: (error: Error, attempt: number) => {
        console.warn(`Failed in Retry attempt ${attempt}. Error: ${error}`);
      },
    }
    );
  } catch (error: any) {
    lastResponse = new Response(error.message, {
      status: error.status,
      headers: {
        "Content-Type": "application/json"
      }
    });
    console.warn(`Tried ${lastAttempt} time(s) but failed. Error: ${JSON.stringify(error)}`);
  }
  return [lastResponse as Response, lastAttempt];
}
