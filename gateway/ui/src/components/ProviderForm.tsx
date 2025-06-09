import React, { useState, useEffect } from 'react';
import { Provider, ProviderInput } from '../api/providers';

interface ProviderFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (provider: ProviderInput) => void;
  initialData?: Provider | null;
  isLoading?: boolean;
  error?: string | null;
}

const ProviderForm: React.FC<ProviderFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  error,
}) => {
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  // Add more fields as necessary based on your ProviderInput type

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setApiKey(initialData.apiKey || '');
      // Set other fields
    } else {
      // Reset form for new entry
      setName('');
      setApiKey('');
    }
  }, [initialData, isOpen]); // Depend on isOpen to reset form when modal reopens

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!name) {
      alert('Provider name is required.'); // Replace with better UX later
      return;
    }
    onSubmit({ name, apiKey /* other fields */ });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-xl rounded-md bg-white">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            {initialData ? 'Edit Provider' : 'Add New Provider'}
          </h3>
          <form onSubmit={handleSubmit} className="mt-2 space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 text-left">
                Provider Name
              </label>
              <input
                type="text"
                name="name"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 text-left">
                API Key (Optional)
              </label>
              <input
                type="password" // Use password type for sensitive fields
                name="apiKey"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            {/* Add more form fields here based on ProviderInput */}
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="items-center px-4 py-3 space-x-2">
              <button
                id="ok-btn"
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-auto hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save'}
              </button>
              <button
                id="cancel-btn"
                type="button"
                className="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-auto hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProviderForm;
