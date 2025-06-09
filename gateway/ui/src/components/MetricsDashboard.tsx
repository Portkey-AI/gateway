import React from 'react';
import { useGetMetrics, useGetCostData } from '../api/observability';

// Basic Chart Component Placeholder (no actual charting library used yet)
const ChartPlaceholder: React.FC<{ title: string; data: any; isLoading: boolean; error?: Error | null }> = ({ title, data, isLoading, error }) => {
  return (
    <div className="p-4 border rounded-lg shadow bg-white">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {isLoading && <p>Loading chart data...</p>}
      {error && <p className="text-red-500">Error: {error.message}</p>}
      {!isLoading && !error && (
        <div className="bg-gray-100 h-48 flex items-center justify-center">
          <pre className="text-xs overflow-auto max-h-full p-2">{data ? JSON.stringify(data, null, 2) : 'No data available for this chart.'}</pre>
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">Note: This is a placeholder. A charting library (e.g., Recharts, Chart.js) would be used here.</p>
    </div>
  );
};


const MetricsDashboard: React.FC = () => {
  // Example: Fetch last hour of latency data, minute granularity
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const { data: latencyData, isLoading: isLoadingLatency, error: latencyError } = useGetMetrics({
    metricName: 'latency',
    startTime: oneHourAgo.toISOString(),
    endTime: now.toISOString(),
    granularity: 'minute',
  });

  const { data: tokenData, isLoading: isLoadingTokens, error: tokenError } = useGetMetrics({
    metricName: 'tokenUsage',
    startTime: oneHourAgo.toISOString(),
    endTime: now.toISOString(),
    granularity: 'minute',
  });

  const { data: costData, isLoading: isLoadingCost, error: costError } = useGetCostData({
    startTime: oneHourAgo.toISOString(),
    endTime: now.toISOString(),
  });


  return (
    <div className="space-y-6">
        <div className="p-4 border rounded-lg shadow bg-white">
            <h3 className="text-lg font-semibold mb-2">Estimated Costs (Last Hour - Dummy Data)</h3>
            {isLoadingCost && <p>Loading cost data...</p>}
            {costError && <p className="text-red-500">Error: {costError.message}</p>}
            {!isLoadingCost && !costError && costData && (
                <p className="text-2xl font-bold">${costData.totalCost.toFixed(2)}</p>
            )}
        </div>

      <ChartPlaceholder title="P95 Latency (Last Hour)" data={latencyData} isLoading={isLoadingLatency} error={latencyError} />
      <ChartPlaceholder title="Token Usage (Last Hour)" data={tokenData} isLoading={isLoadingTokens} error={tokenError} />
      {/* Add more charts as needed */}
    </div>
  );
};

export default MetricsDashboard;
