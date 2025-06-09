import React, { useState } from 'react';
import ProviderList from '../components/ProviderList';
import ProviderForm from '../components/ProviderForm';
import { useGetProviders, useAddProvider, useUpdateProvider, useDeleteProvider, Provider, ProviderInput } from '../api/providers';

function ProvidersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  const { data: providers, isLoading, error: fetchError } = useGetProviders();
  const addProviderMutation = useAddProvider();
  const updateProviderMutation = useUpdateProvider();
  const deleteProviderMutation = useDeleteProvider();

  const handleOpenModal = (provider?: Provider) => {
    setEditingProvider(provider || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingProvider(null);
    setIsModalOpen(false);
  };

  const handleSubmitProvider = async (providerData: ProviderInput) => {
    try {
      if (editingProvider) {
        await updateProviderMutation.mutateAsync({ ...providerData, id: editingProvider.id });
      } else {
        await addProviderMutation.mutateAsync(providerData);
      }
      handleCloseModal();
    } catch (err) {
      // Error is handled by the mutation's onError, but you can add specific UI updates here
      console.error("Failed to save provider:", err);
      // The form itself will display mutation.error if passed to it
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (window.confirm('Are you sure you want to delete this provider?')) {
      try {
        await deleteProviderMutation.mutateAsync(providerId);
      } catch (err) {
        console.error("Failed to delete provider:", err);
        alert(`Error: ${deleteProviderMutation.error?.message || 'Could not delete provider.'}`);
      }
    }
  };

  // Determine error message for the form
  const formError = editingProvider ? updateProviderMutation.error?.message : addProviderMutation.error?.message;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Manage Providers</h1>
        <button
          onClick={() => handleOpenModal()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Add New Provider
        </button>
      </div>

      {isLoading && <p>Loading providers...</p>}
      {fetchError && <p className="text-red-500">Error fetching providers: {fetchError.message}</p>}

      {!isLoading && !fetchError && providers && (
        <ProviderList
          providers={providers}
          onEdit={handleOpenModal}
          onDelete={handleDeleteProvider}
          isLoadingDelete={deleteProviderMutation.isPending}
        />
      )}

      {isModalOpen && (
         <ProviderForm
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSubmit={handleSubmitProvider}
          initialData={editingProvider}
          isLoading={addProviderMutation.isPending || updateProviderMutation.isPending}
          error={formError}
        />
      )}
    </div>
  );
}

export default ProvidersPage;
