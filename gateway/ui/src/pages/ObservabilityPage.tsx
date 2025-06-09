import React, { useState } from 'react';
import LogsView from '../components/LogsView';
import MetricsDashboard from '../components/MetricsDashboard';

type Tab = 'logs' | 'metrics';

function ObservabilityPage() {
  const [activeTab, setActiveTab] = useState<Tab>('logs');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-4">Observability</h1>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('logs')}
              className={`${
                activeTab === 'logs'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Request Logs
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className={`${
                activeTab === 'metrics'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Metrics & Visualizations
            </button>
          </nav>
        </div>
      </div>

      <div>
        {activeTab === 'logs' && <LogsView />}
        {activeTab === 'metrics' && <MetricsDashboard />}
      </div>
    </div>
  );
}

export default ObservabilityPage;
