import React, { useState } from 'react';
import { LogEntry, useGetLogs, GetLogsParams } from '../api/observability';

const LogsView: React.FC = () => {
  const [showDetails, setShowDetails] = useState<string | null>(null); // Stores ID of log entry to show details for
  // Basic filter ideas - can be expanded
  const [filterParams, setFilterParams] = useState<GetLogsParams>({ limit: 50 });

  const { data: logs, isLoading, error, refetch } = useGetLogs(filterParams);

  const toggleDetails = (id: string) => {
    setShowDetails(showDetails === id ? null : id);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilterParams(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleApplyFilters = () => {
    refetch();
  }


  if (isLoading) return <p>Loading logs...</p>;
  if (error) return <p className="text-red-500">Error fetching logs: {error.message}</p>;
  if (!logs || logs.length === 0) return <p>No logs found for the current filters.</p>;

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-md bg-gray-50 space-y-2 md:space-y-0 md:flex md:items-end md:space-x-2">
        <div>
            <label htmlFor="limit" className="block text-sm font-medium text-gray-700">Limit</label>
            <input
                type="number"
                name="limit"
                id="limit"
                value={filterParams.limit || 50}
                onChange={handleFilterChange}
                className="mt-1 block w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"
            />
        </div>
        {/* Add more filter inputs here: startTime, endTime, provider, etc. */}
        <button
            onClick={handleApplyFilters}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700"
        >
            Apply Filters / Refresh
        </button>
      </div>

      <div className="overflow-x-auto bg-white shadow rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latency (ms)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens (P/C/T)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log) => (
              <React.Fragment key={log.id}>
                <tr>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{log.method}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs" title={log.url}>{log.url}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                     <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        log.statusCode >= 200 && log.statusCode < 300 ? 'bg-green-100 text-green-800' :
                        log.statusCode >= 400 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                     }`}>
                        {log.statusCode}
                     </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{log.latencyMs}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {log.promptTokens ?? '-'}/{log.completionTokens ?? '-'}/{log.totalTokens ?? '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => toggleDetails(log.id)} className="text-indigo-600 hover:text-indigo-900">
                      {showDetails === log.id ? 'Hide Details' : 'Show Details'}
                    </button>
                  </td>
                </tr>
                {showDetails === log.id && (
                  <tr>
                    <td colSpan={7} className="p-4 bg-gray-50">
                      <div className="text-sm text-gray-700 space-y-2">
                        <p><strong>Request ID:</strong> {log.id}</p>
                        {log.provider && <p><strong>Provider:</strong> {log.provider}</p>}
                        {log.virtualKeyId && <p><strong>Virtual Key ID:</strong> {log.virtualKeyId}</p>}
                        {log.configId && <p><strong>Config ID:</strong> {log.configId}</p>}
                        {log.error && <p><strong>Error:</strong> <span className="text-red-600">{log.error}</span></p>}

                        {log.requestHeaders && <div><strong>Request Headers:</strong> <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto max-h-40">{JSON.stringify(log.requestHeaders, null, 2)}</pre></div>}
                        {log.requestBody && <div><strong>Request Body:</strong> <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto max-h-40">{typeof log.requestBody === 'string' ? log.requestBody : JSON.stringify(log.requestBody, null, 2)}</pre></div>}
                        {log.responseHeaders && <div><strong>Response Headers:</strong> <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto max-h-40">{JSON.stringify(log.responseHeaders, null, 2)}</pre></div>}
                        {log.responseBody && <div><strong>Response Body:</strong> <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto max-h-40">{typeof log.responseBody === 'string' ? log.responseBody : JSON.stringify(log.responseBody, null, 2)}</pre></div>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LogsView;
