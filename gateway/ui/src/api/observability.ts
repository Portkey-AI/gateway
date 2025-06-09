import { useQuery } from '@tanstack/react-query';

const API_BASE_URL = '/v1'; // Handled by Nginx proxy

// --- Log Types ---
export interface LogEntry {
  id: string;
  timestamp: string;
  method: string; // e.g., POST
  url: string;
  statusCode: number;
  latencyMs: number;
  requestHeaders?: Record<string, string>;
  requestBody?: any;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  provider?: string;
  virtualKeyId?: string;
  configId?: string; // If a named config was used
  error?: string; // If an error occurred
  // Fields for token counts
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface GetLogsParams {
  limit?: number;
  startTime?: string; // ISO 8601
  endTime?: string; // ISO 8601
  // Add other filter parameters like provider, virtualKeyId, statusCode, etc.
}

// Fetch logs
export const useGetLogs = (params: GetLogsParams = { limit: 100 }) => {
  return useQuery<LogEntry[], Error>({
    queryKey: ['logs', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params.limit) queryParams.append('limit', String(params.limit));
      if (params.startTime) queryParams.append('startTime', params.startTime);
      if (params.endTime) queryParams.append('endTime', params.endTime);
      // Append other params

      const response = await fetch(`${API_BASE_URL}/logs?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      return response.json();
    },
    // Example: refetch every 5 seconds for pseudo real-time
    // refetchInterval: 5000,
  });
};


// --- Metrics Types ---
// This is a simplified example. Metrics data can be complex.
export interface MetricDataPoint {
  time: string; // Timestamp for the data point
  value: number;
  // Optional dimensions like provider, model, etc.
  [dimension: string]: any;
}

export interface GetMetricsParams {
  metricName: 'latency' | 'tokenUsage' | 'requestCount'; // Example metric names
  startTime?: string;
  endTime?: string;
  granularity?: 'minute' | 'hour' | 'day';
  // Other filters like provider, virtualKeyId
}

// Fetch metrics
export const useGetMetrics = (params: GetMetricsParams) => {
  return useQuery<MetricDataPoint[], Error>({
    queryKey: ['metrics', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      queryParams.append('metricName', params.metricName);
      if (params.startTime) queryParams.append('startTime', params.startTime);
      if (params.endTime) queryParams.append('endTime', params.endTime);
      if (params.granularity) queryParams.append('granularity', params.granularity);
      // Append other params

      const response = await fetch(`${API_BASE_URL}/metrics?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch metrics for ${params.metricName}`);
      }
      return response.json();
    },
  });
};

// Placeholder for cost data - this would be more complex
export interface CostData {
    totalCost: number;
    // breakdown by provider, model, etc.
}
export const useGetCostData = (params: {startTime?: string, endTime?: string}) => {
    return useQuery<CostData, Error>({
        queryKey: ['costs', params],
        queryFn: async () => {
            // Dummy data for now
            await new Promise(resolve => setTimeout(resolve, 500)); // simulate network delay
            return { totalCost: Math.random() * 1000 };
        },
    });
}
