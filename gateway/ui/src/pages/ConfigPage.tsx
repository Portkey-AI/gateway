import React, { useState } from 'react';
import { useGetConfigs, useAddConfig, useUpdateConfig, useDeleteConfig, NamedConfig, NamedConfigInput, PortkeyConfig } from '../api/configs';
import ConfigEditor from '../components/ConfigEditor'; // To be created

function ConfigsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<NamedConfig | null>(null);

  const { data: configs, isLoading, error: fetchError } = useGetConfigs();
  const addConfigMutation = useAddConfig();
  const updateConfigMutation = useUpdateConfig();
  const deleteConfigMutation = useDeleteConfig();

  const handleOpenModal = (config?: NamedConfig) => {
    setEditingConfig(config || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingConfig(null);
    setIsModalOpen(false);
  };

  const handleSubmitConfig = async (configData: NamedConfigInput) => {
    try {
      if (editingConfig) {
        await updateConfigMutation.mutateAsync({ ...configData, id: editingConfig.id });
      } else {
        await addConfigMutation.mutateAsync(configData);
      }
      handleCloseModal();
    } catch (err) {
      console.error("Failed to save config:", err);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (window.confirm('Are you sure you want to delete this configuration?')) {
      try {
        await deleteConfigMutation.mutateAsync(configId);
      } catch (err) {
        console.error("Failed to delete config:", err);
        alert(`Error: ${deleteConfigMutation.error?.message || 'Could not delete config.'}`);
      }
    }
  };

  const formError = editingConfig ? updateConfigMutation.error?.message : addConfigMutation.error?.message;

  // Prepare initial data for editor if editing
  const editorInitialData: NamedConfigInput | null = editingConfig ?
    { name: editingConfig.name, description: editingConfig.description, config: editingConfig.config } : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Manage Configurations (x-portkey-config)</h1>
        <button
          onClick={() => handleOpenModal()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Create New Configuration
        </button>
      </div>

      {isLoading && <p>Loading configurations...</p>}
      {fetchError && <p className="text-red-500">Error fetching configurations: {fetchError.message}</p>}

      {!isLoading && !fetchError && configs && (
        <div className="space-y-4">
          {configs.length === 0 && <p>No configurations found. Create one to define routing strategies.</p>}
          {configs.map(config => (
            <div key={config.id} className="p-4 border rounded-md shadow-sm bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-blue-600">{config.name}</h3>
                  <p className="text-sm text-gray-600">{config.description || 'No description'}</p>
                  <p className="text-xs text-gray-500 mt-1">Strategy: <span className="font-medium">{config.config.strategy?.mode || 'N/A'}</span></p>
                  <p className="text-xs text-gray-500">Targets: <span className="font-medium">{config.config.strategy?.targets?.length || 0}</span></p>
                   <p className="text-xs text-gray-500">Retries: <span className="font-medium">{config.config.retry?.retries ?? 'Default'}</span>, Timeout: <span className="font-medium">{config.config.retry?.timeout ?? 'Default'}ms</span></p>
                </div>
                <div className="space-x-2 flex-shrink-0 mt-1">
                  <button onClick={() => handleOpenModal(config)} className="text-sm text-indigo-600 hover:text-indigo-900">Edit</button>
                  <button
                    onClick={() => handleDeleteConfig(config.id)}
                    className="text-sm text-red-600 hover:text-red-900"
                    disabled={deleteConfigMutation.isPending && deleteConfigMutation.variables === config.id}
                  >
                    {deleteConfigMutation.isPending && deleteConfigMutation.variables === config.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer">View JSON Config</summary>
                <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                  {JSON.stringify(config.config, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
         <ConfigEditor
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSubmit={handleSubmitConfig}
          initialData={editorInitialData}
          isLoading={addConfigMutation.isPending || updateConfigMutation.isPending}
          error={formError}
        />
      )}
    </div>
  );
}

export default ConfigsPage;
