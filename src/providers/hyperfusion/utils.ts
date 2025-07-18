import { HYPERFUSION } from '../../globals';
import { ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';

/**
 * Transform an error response from Hyperfusion API
 */
export const HyperfusionErrorResponseTransform: (
  response: ErrorResponse,
  provider: string
) => ErrorResponse = (response, provider) => {
  return generateErrorResponse(
    {
      ...response.error,
    },
    provider
  );
};

/**
 * Create a standardized error response for Hyperfusion API
 * @param message Error message
 * @param type Error type
 * @param param Error parameter
 * @param code Error code
 * @returns Standardized error response
 */
export const createHyperfusionErrorResponse = (
  message: string,
  type: string = 'hyperfusion_error',
  param: string | null = null,
  code: string | null = null
): ErrorResponse => {
  return {
    error: {
      message,
      type,
      param,
      code,
    },
    provider: HYPERFUSION,
  };
};

/**
 * Handle error responses from Hyperfusion API
 * @param response The response from the API
 * @param responseStatus The HTTP status code
 * @returns Standardized error response
 */
export const handleHyperfusionErrorResponse = (
  response: any,
  responseStatus: number
): ErrorResponse => {
  // Check if response is a string (might be a plain text error message)
  if (typeof response === 'string') {
    return createHyperfusionErrorResponse(
      `Hyperfusion API error: ${response}`,
      'hyperfusion_error',
      null,
      String(responseStatus)
    );
  }
  // Handle case where response is null or undefined
  else if (!response) {
    return createHyperfusionErrorResponse(
      `Hyperfusion API returned status ${responseStatus} with empty response`,
      'hyperfusion_error',
      null,
      String(responseStatus)
    );
  }
  // Handle case where response has error field
  else if ('error' in response) {
    return createHyperfusionErrorResponse(
      response.error.message || 'Unknown error occurred',
      response.error.type || 'hyperfusion_error',
      response.error.param || null,
      response.error.code || String(responseStatus)
    );
  }
  // Handle case where response doesn't have error field but status is not 200
  else {
    return createHyperfusionErrorResponse(
      `Hyperfusion API returned status ${responseStatus} without error details`,
      'hyperfusion_error',
      null,
      String(responseStatus)
    );
  }
};

/**
 * Handle malformed responses from Hyperfusion API
 * @returns Standardized error response for malformed responses
 */
export const handleMalformedResponse = (): ErrorResponse => {
  return createHyperfusionErrorResponse(
    'Received invalid response from Hyperfusion API',
    'invalid_response_error',
    null,
    'invalid_response'
  );
};

/**
 * Handle unexpected errors during response transformation
 * @param err The error that occurred
 * @returns Standardized error response for unexpected errors
 */
export const handleUnexpectedError = (err: any): ErrorResponse => {
  return createHyperfusionErrorResponse(
    `Unexpected error processing Hyperfusion API response: ${err.message || 'Unknown error'}`,
    'hyperfusion_error',
    null,
    'transform_error'
  );
};

/**
 * Generic response transformer for Hyperfusion API responses
 * @param response The response from the API
 * @param responseStatus The HTTP status code
 * @returns Transformed response or error response
 */
export const transformHyperfusionResponse = <T>(
  response: T | ErrorResponse | any,
  responseStatus: number
): T | ErrorResponse => {
  try {
    // Handle case where status is not 200
    if (responseStatus !== 200) {
      return handleHyperfusionErrorResponse(response, responseStatus);
    }

    // Handle case where response is malformed
    if (!response || typeof response !== 'object') {
      return handleMalformedResponse();
    }

    return response as T;
  } catch (err: any) {
    // Catch any unexpected errors in the transform function
    return handleUnexpectedError(err);
  }
};

/**
 * Log response details for debugging
 * @param functionName The name of the function being logged
 * @param response The response being logged
 * @param responseStatus The HTTP status code
 */
export const logResponseDetails = (
  functionName: string,
  response: any,
  responseStatus: number
): void => {
  
  if (responseStatus !== 200) {
    console.log(`${functionName} - Error Response:`,
      typeof response === 'object' ? JSON.stringify(response, null, 2) : response);
  }
};

/**
 * Validate that a response is properly formed
 * @param response The response to validate
 * @returns True if the response is valid, false otherwise
 */
export const isValidResponse = (response: any): boolean => {
  return response && typeof response === 'object';
};