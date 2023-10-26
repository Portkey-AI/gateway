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

export function convertKeysToCamelCase<T>(
    obj: Record<string, any>,
    parentKeysToPreserve: string[] = []
  ): T {
    if (typeof obj !== 'object' || obj === null) {
      return obj; // Return unchanged for non-objects or null
    }
  
    if (Array.isArray(obj)) {
      // If it's an array, recursively convert each element
      return obj.map((item) => convertKeysToCamelCase(item, parentKeysToPreserve)) as T;
    }
  
    return Object.keys(obj).reduce((result: any, key: string) => {
      const value = obj[key];
      const camelCaseKey = toCamelCase(key);
      const isParentKeyToPreserve = parentKeysToPreserve.includes(key);
      if (typeof value === 'object' && !isParentKeyToPreserve) {
        // Recursively convert child objects
        result[camelCaseKey] = convertKeysToCamelCase(value, parentKeysToPreserve);
      } else {
        // Add key in camelCase to the result
        result[camelCaseKey] = value;
      }
  
      return result;
    }, {} as T);
  
    function toCamelCase(snakeCase: string): string {
      return snakeCase.replace(/(_\w)/g, (match) => match[1].toUpperCase());
    }
  }