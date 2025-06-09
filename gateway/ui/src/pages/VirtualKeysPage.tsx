import React, { useState } from 'react';
import VirtualKeyList from '../components/VirtualKeyList';
import VirtualKeyForm from '../components/VirtualKeyForm';
import { useGetVirtualKeys, useAddVirtualKey, useUpdateVirtualKey, useDeleteVirtualKey, VirtualKey, VirtualKeyInput } from '../api/virtualKeys';

function VirtualKeysPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVirtualKey, setEditingVirtualKey] = useState<VirtualKey | null>(null);

  const { data: virtualKeys, isLoading, error: fetchError } = useGetVirtualKeys();
  const addVirtualKeyMutation = useAddVirtualKey();
  const updateVirtualKeyMutation = useUpdateVirtualKey();
  const deleteVirtualKeyMutation = useDeleteVirtualKey();

  const handleOpenModal = (virtualKey?: VirtualKey) => {
    setEditingVirtualKey(virtualKey || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingVirtualKey(null);
    setIsModalOpen(false);
  };

  const handleSubmitVirtualKey = async (virtualKeyData: VirtualKeyInput) => {
    try {
      if (editingVirtualKey) {
        await updateVirtualKeyMutation.mutateAsync({ ...virtualKeyData, id: editingVirtualKey.id, key: editingVirtualKey.key }); // ensure key is passed if not editable or backend handles
      } else {
        await addVirtualKeyMutation.mutateAsync(virtualKeyData);
      }
      handleCloseModal();
    } catch (err) {
      console.error("Failed to save virtual key:", err);
    }
  };

  const handleDeleteVirtualKey = async (virtualKeyId: string) => {
    if (window.confirm('Are you sure you want to delete this virtual key? This action cannot be undone.')) {
      try {
        await deleteVirtualKeyMutation.mutateAsync(virtualKeyId);
      } catch (err) {
        console.error("Failed to delete virtual key:", err);
        alert(`Error: ${deleteVirtualKeyMutation.error?.message || 'Could not delete virtual key.'}`);
      }
    }
  };

  const formError = editingVirtualKey ? updateVirtualKeyMutation.error?.message : addVirtualKeyMutation.error?.message;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Manage Virtual Keys</h1>
        <button
          onClick={() => handleOpenModal()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Create New Virtual Key
        </button>
      </div>

      {isLoading && <p>Loading virtual keys...</p>}
      {fetchError && <p className="text-red-500">Error fetching virtual keys: {fetchError.message}</p>}

      {!isLoading && !fetchError && virtualKeys && (
        <VirtualKeyList
          virtualKeys={virtualKeys}
          onEdit={handleOpenModal}
          onDelete={handleDeleteVirtualKey}
          isLoadingDelete={deleteVirtualKeyMutation.isPending}
        />
      )}

      {isModalOpen && (
         <VirtualKeyForm
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSubmit={handleSubmitVirtualKey}
          initialData={editingVirtualKey}
          isLoading={addVirtualKeyMutation.isPending || updateVirtualKeyMutation.isPending}
          error={formError}
        />
      )}
    </div>
  );
}

export default VirtualKeysPage;
