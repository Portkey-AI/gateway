import { CACHE_STATUS } from '../globals';

export function deriveTimingMetrics(
  index: number,
  latestRequestOption: Record<string, any>,
  requestParsingTime: number,
  preProcessingTime: number,
  authNLatency: number
) {
  // request parsing and pre processing is only attributed for first request option
  // rate limits (pre request validator) is attributed as pre processing time for all request options
  const derivedRequestParsingTime = index === 0 ? requestParsingTime : 0;
  const derivedPreProcessingTime =
    index === 0
      ? preProcessingTime +
        authNLatency +
        latestRequestOption.preRequestValidatorExecutionTime
      : latestRequestOption.preRequestValidatorExecutionTime;

  const gatewayProcessingTime = Math.max(
    0,
    latestRequestOption.targetProcessingTime -
      latestRequestOption.cacheExecutionTime -
      latestRequestOption.responseParsingTime -
      // For cache hits, cache execution time is considered as upstream response time
      // So, it should not be subtracted twice
      ([CACHE_STATUS.HIT, CACHE_STATUS.SEMANTIC_HIT].includes(
        latestRequestOption.cacheStatus
      )
        ? 0
        : latestRequestOption.executionTime) -
      latestRequestOption.brhExecutionTime -
      latestRequestOption.arhExecutionTime -
      latestRequestOption.preRequestValidatorExecutionTime
  );

  return {
    requestParsingTime: derivedRequestParsingTime,
    preProcessingTime: derivedPreProcessingTime,
    cacheExecutionTime: latestRequestOption.cacheExecutionTime,
    responseParsingTime: latestRequestOption.responseParsingTime,
    gatewayProcessingTime,
    upstreamResponseTime: latestRequestOption.executionTime,
    timeToLastToken: latestRequestOption.executionTime,
  };
}
