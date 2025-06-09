import React, { useState, useEffect } from 'react';
import { PortkeyConfig, StrategyMode, ConfigTarget, RetryPolicy, NamedConfigInput } from '../api/configs';
import { Provider, useGetProviders } from '../api/providers';

interface ConfigEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (configPayload: NamedConfigInput) => void;
  initialData?: NamedConfigInput | null; // If editing an existing config (NamedConfigInput)
  isLoading?: boolean;
  error?: string | null;
}

const ConfigEditor: React.FC<ConfigEditorProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  error,
}) => {
  const [configName, setConfigName] = useState('');
  const [configDescription, setConfigDescription] = useState('');
  const [strategyMode, setStrategyMode] = useState<StrategyMode>('single');
  const [targets, setTargets] = useState<ConfigTarget[]>([]);
  const [retries, setRetries] = useState<number | undefined>(undefined);
  const [timeout, setTimeoutVal] = useState<number | undefined>(undefined); // Renamed to avoid conflict

  const { data: availableProviders, isLoading: isLoadingProviders } = useGetProviders();

  useEffect(() => {
    if (initialData) {
      setConfigName(initialData.name);
      setConfigDescription(initialData.description || '');
      const currentConfig = initialData.config;
      if (currentConfig.strategy) {
        setStrategyMode(currentConfig.strategy.mode);
        setTargets(currentConfig.strategy.targets || []);
      } else {
        setStrategyMode('single');
        setTargets([]);
      }
      if (currentConfig.retry) {
        setRetries(currentConfig.retry.retries);
        setTimeoutVal(currentConfig.retry.timeout);
      } else {
        setRetries(undefined);
        setTimeoutVal(undefined);
      }
    } else {
      // Reset form
      setConfigName('');
      setConfigDescription('');
      setStrategyMode('single');
      setTargets([{ provider: '' }]); // Default for single
      setRetries(undefined);
      setTimeoutVal(undefined);
    }
  }, [initialData, isOpen]);

  const handleAddTarget = () => {
    setTargets([...targets, { provider: '' }]);
  };

  const handleRemoveTarget = (index: number) => {
    setTargets(targets.filter((_, i) => i !== index));
  };

  const handleTargetChange = (index: number, field: keyof ConfigTarget, value: any) => {
    const newTargets = [...targets];
    newTargets[index] = { ...newTargets[index], [field]: value };
    setTargets(newTargets);
  };

  const handleStrategyModeChange = (mode: StrategyMode) => {
    setStrategyMode(mode);
    // Reset targets based on mode
    if (mode === 'single') {
        setTargets(targets.length > 0 ? [targets[0]] : [{ provider: ''}])
    } else {
        // For fallback/loadbalance, allow multiple, for conditional, it's more complex
        // For now, just keep existing or add one if empty
        if (targets.length === 0) setTargets([{ provider: '' }]);
    }
  }


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!configName.trim()){
        alert("Configuration name is required."); // Basic validation
        return;
    }

    const portkeyConfig: PortkeyConfig = {
      strategy: {
        mode: strategyMode,
        targets: strategyMode === 'single' ? (targets.length > 0 ? [targets[0]] : []) : targets,
      },
      retry: {
        retries: retries,
        timeout: timeout,
      },
    };

    // Filter out empty targets or targets without a provider if necessary
    if (portkeyConfig.strategy && portkeyConfig.strategy.targets) {
        portkeyConfig.strategy.targets = portkeyConfig.strategy.targets.filter(t => t.provider || t.virtualKey);
    }


    onSubmit({ name: configName, description: configDescription, config: portkeyConfig });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-xl rounded-md bg-white mb-10">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          {initialData ? 'Edit Configuration' : 'Create New Configuration'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Config Name and Description */}
          <div>
            <label htmlFor="configName" className="block text-sm font-medium text-gray-700">Configuration Name</label>
            <input type="text" name="configName" id="configName" value={configName} onChange={(e) => setConfigName(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" /> {/* py-2 already present */}
          </div>
          <div>
            <label htmlFor="configDescription" className="block text-sm font-medium text-gray-700">Description (Optional)</label>
            <textarea name="configDescription" id="configDescription" value={configDescription} onChange={(e) => setConfigDescription(e.target.value)} rows={2} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" /> {/* py-2 already present */}
          </div>

          {/* Strategy Selection */}
          <fieldset className="border p-4 rounded-md">
            <legend className="text-md font-medium text-gray-700 px-1">Strategy</legend>
            <div className="space-y-2">
                <select value={strategyMode} onChange={(e) => handleStrategyModeChange(e.target.value as StrategyMode)} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"> {/* py-2 already present */}
                <option value="single">Single Provider</option>
                <option value="fallback">Fallback</option>
                <option value="loadbalance">Load Balance</option>
                <option value="conditional">Conditional (Coming Soon)</option>
                </select>

                {/* Targets Configuration */}
                {strategyMode !== 'conditional' && targets.map((target, index) => (
                <div key={index} className="p-3 border rounded-md space-y-2 bg-gray-50">
                    <div className="flex justify-between items-center">
                        <p className="font-medium">Target {index + 1}</p>
                        { (strategyMode === 'fallback' || strategyMode === 'loadbalance') && targets.length > 1 && (
                            <button type="button" onClick={() => handleRemoveTarget(index)} className="text-red-500 hover:text-red-700 text-sm">Remove</button>
                        )}
                    </div>
                    <div>
                        <label className="text-sm">Provider:</label>
                        <select
                            value={target.provider || ''}
                            onChange={(e) => handleTargetChange(index, 'provider', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs"
                            disabled={isLoadingProviders}
                        >
                            <option value="">{isLoadingProviders ? "Loading..." : "Select Provider"}</option>
                            {availableProviders?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    {/* TODO: Add fields for virtualKey, override_params, weight (for loadbalance) */}
                    {strategyMode === 'loadbalance' && (
                        <div>
                            <label className="text-sm">Weight:</label>
                            <input type="number" value={target.weight || ''} onChange={e => handleTargetChange(index, 'weight', parseInt(e.target.value))} className="mt-1 block w-full px-3 py-2 border-gray-300 rounded-md sm:text-xs" min="1"/>
                        </div>
                    )}
                    {/* Basic Override Params Example - needs more robust UI */}
                    <div>
                        <label className="text-sm">Override Params (e.g., Model):</label>
                        <input type="text" placeholder="model=gpt-4-turbo" value={target.override_params?.model || ''} onChange={e => handleTargetChange(index, 'override_params', {...target.override_params, model: e.target.value})} className="mt-1 block w-full px-3 py-2 border-gray-300 rounded-md sm:text-xs"/>
                    </div>

                </div>
                ))}
                {(strategyMode === 'fallback' || strategyMode === 'loadbalance') && (
                    <button type="button" onClick={handleAddTarget} className="text-sm text-blue-600 hover:text-blue-800 mt-2">+ Add Target</button>
                )}
                {strategyMode === 'conditional' && <p className="text-sm text-gray-500 p-4 text-center">Conditional routing UI is under development.</p>}
            </div>
          </fieldset>

          {/* Retry Policy */}
          <fieldset className="border p-4 rounded-md">
            <legend className="text-md font-medium text-gray-700 px-1">Reliability (Retry Policy)</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="retries" className="block text-sm font-medium text-gray-700">Retries</label>
                    <input type="number" name="retries" id="retries" value={retries ?? ''} onChange={e => setRetries(e.target.value ? parseInt(e.target.value) : undefined)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" min="0" /> {/* py-2 already present */}
                </div>
                <div>
                    <label htmlFor="timeout" className="block text-sm font-medium text-gray-700">Timeout (ms)</label>
                    <input type="number" name="timeout" id="timeout" value={timeout ?? ''} onChange={e => setTimeoutVal(e.target.value ? parseInt(e.target.value) : undefined)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" min="0"/> {/* py-2 already present */}
                </div>
            </div>
          </fieldset>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="pt-4 flex justify-end space-x-2">
            <button type="button" className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400" onClick={onClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700" disabled={isLoading || isLoadingProviders || strategyMode === 'conditional'}>{isLoading ? 'Saving...' : 'Save Configuration'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConfigEditor;
