import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Define the Provider type based on expected API response
export interface Provider {
  id: string; // Assuming IDs are strings, adjust if necessary
  name: string;
  apiKey?: string; // Assuming API key might be part of the provider data
  // Add other relevant provider fields here based on Portkey's backend
  // For example: model, baseURL, specific provider options, etc.
  // For now, keeping it simple.
  createdAt: string;
  updatedAt: string;
}

// Define the type for creating/updating a provider (omitting id, createdAt, updatedAt)
export type ProviderInput = Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>;


const API_BASE_URL = '/v1'; // Handled by Nginx proxy

// Fetch all providers
export const useGetProviders = () => {
  return useQuery<Provider[], Error>({
    queryKey: ['providers'],
    queryFn: async () => { // Corrected: Removed _PROVIDER_TYPE
      const response = await fetch(`${API_BASE_URL}/providers`);
      if (!response.ok) {
        throw new Error('Failed to fetch providers');
      }
      return response.json();
    },
  });
};

// Add a new provider
export const useAddProvider = () => {
  const queryClient = useQueryClient();
  return useMutation<Provider, Error, ProviderInput>({
    mutationFn: async (newProvider) => {
      const response = await fetch(`${API_BASE_URL}/providers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newProvider),
      });
      if (!response.ok) {
        // Consider more specific error handling based on response
        const errorData = await response.json().catch(() => ({ message: 'Failed to add provider' }));
        throw new Error(errorData.message || 'Failed to add provider');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
};

// Update an existing provider
export const useUpdateProvider = () => {
  const queryClient = useQueryClient();
  return useMutation<Provider, Error, Provider & { id: string }>({ // Ensure ID is passed
    mutationFn: async (updatedProvider) => {
      const response = await fetch(`${API_BASE_URL}/providers/${updatedProvider.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedProvider),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update provider' }));
        throw new Error(errorData.message || 'Failed to update provider');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      // Optionally, update the specific provider in cache
      // queryClient.setQueryData(['providers', { id: variables.id }], data);
    },
  });
};

// Delete a provider
export const useDeleteProvider = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({ // string for providerId
    mutationFn: async (providerId) => {
      const response = await fetch(`${API_BASE_URL}/providers/${providerId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete provider' }));
        throw new Error(errorData.message || 'Failed to delete provider');
      }
      // No content expected on successful delete, but check if API returns something
      // return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
};
