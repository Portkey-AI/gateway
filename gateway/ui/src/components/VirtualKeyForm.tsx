import React, { useState, useEffect } from 'react';
import { VirtualKey, VirtualKeyInput } from '../api/virtualKeys';
import { Provider, useGetProviders } from '../api/providers'; // To select providers

interface VirtualKeyFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (virtualKey: VirtualKeyInput) => void;
  initialData?: VirtualKey | null;
  isLoading?: boolean;
  error?: string | null;
}

const VirtualKeyForm: React.FC<VirtualKeyFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  error,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  // Add more fields for limits, permissions, metadata as state variables

  const { data: availableProviders, isLoading: isLoadingProviders } = useGetProviders();

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setDescription(initialData.description || '');
      setSelectedProviders(initialData.providerIds || []);
      setIsActive(initialData.isActive);
      // Set other fields from initialData
    } else {
      // Reset form for new entry
      setName('');
      setDescription('');
      setSelectedProviders([]);
      setIsActive(true);
    }
  }, [initialData, isOpen]);

  const handleProviderSelection = (providerId: string) => {
    setSelectedProviders(prev =>
      prev.includes(providerId) ? prev.filter(id => id !== providerId) : [...prev, providerId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description,
      providerIds: selectedProviders,
      isActive,
      // include other fields like usageLimits, permissions, metadata
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-full max-w-lg shadow-xl rounded-md bg-white">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          {initialData ? 'Edit Virtual Key' : 'Create New Virtual Key'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="keyName" className="block text-sm font-medium text-gray-700">
              Name (Optional)
            </label>
            <input
              type="text"
              name="keyName"
              id="keyName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description (Optional)
            </label>
            <textarea
              name="description"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Associated Providers</label>
            {isLoadingProviders ? <p>Loading providers...</p> : (
              <div className="mt-2 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border p-2 rounded">
                {availableProviders?.map((provider: Provider) => (
                  <label key={provider.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedProviders.includes(provider.id)}
                      onChange={() => handleProviderSelection(provider.id)}
                      className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                    />
                    <span>{provider.name}</span>
                  </label>
                ))}
                {(!availableProviders || availableProviders.length === 0) && <p className="text-sm text-gray-500">No providers available. Please add providers first.</p>}
              </div>
            )}
          </div>

          <div className="flex items-center">
            <input
              id="isActive"
              name="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
              Active
            </label>
          </div>

          {/* Placeholder for other fields: Strategy, Limits, Permissions, Metadata */}
          <p className="text-sm text-gray-500 italic">More settings like strategy, limits, permissions, and metadata will be added here.</p>


          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="pt-4 flex justify-end space-x-2">
            <button
              type="button"
              className="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md hover:bg-gray-400 focus:outline-none"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md hover:bg-blue-700 focus:outline-none"
              disabled={isLoading || isLoadingProviders}
            >
              {isLoading ? 'Saving...' : 'Save Virtual Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VirtualKeyForm;
