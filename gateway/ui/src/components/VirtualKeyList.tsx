import React from 'react';
import { VirtualKey } from '../api/virtualKeys';

interface VirtualKeyListProps {
  virtualKeys: VirtualKey[];
  onEdit: (virtualKey: VirtualKey) => void;
  onDelete: (virtualKeyId: string) => void;
  isLoadingDelete?: boolean;
}

const VirtualKeyList: React.FC<VirtualKeyListProps> = ({ virtualKeys, onEdit, onDelete, isLoadingDelete }) => {
  if (!virtualKeys || virtualKeys.length === 0) {
    return <p>No virtual keys found. Create one to get started!</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Key (Partial)
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Providers
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created At
            </th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {virtualKeys.map((vk) => (
            <tr key={vk.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{vk.name || '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                {/* Show only a portion of the key for security, e.g., first 4 and last 4 chars */}
                {vk.key ? `${vk.key.substring(0, 4)}...${vk.key.substring(vk.key.length - 4)}` : 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                  vk.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {vk.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vk.providerIds.length}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(vk.createdAt).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button
                  onClick={() => onEdit(vk)}
                  className="text-indigo-600 hover:text-indigo-900"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(vk.id)}
                  className="text-red-600 hover:text-red-900"
                  disabled={isLoadingDelete}
                >
                  {isLoadingDelete ? 'Deleting...' : 'Delete'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default VirtualKeyList;
