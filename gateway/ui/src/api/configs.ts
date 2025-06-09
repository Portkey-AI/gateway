import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// --- Core Configuration Types for x-portkey-config ---

// Represents a single target in the config (e.g., a specific provider with overrides)
export interface ConfigTarget {
  provider?: string; // References a provider name/ID configured in Portkey
  virtualKey?: string; // References a virtual key
  override_params?: Record<string, any>; // e.g., { "model": "gpt-4" }
  weight?: number; // For load balancing
  // For conditional routing, this might point to another config or have specific conditions
}

// Mode can be "single", "fallback", "loadbalance", "conditional"
export type StrategyMode = "single" | "fallback" | "loadbalance" | "conditional";

export interface Strategy {
  mode: StrategyMode;
  targets?: ConfigTarget[]; // Used for fallback (order matters), loadbalance
  // For 'single' mode, 'targets' would ideally be just one, or use a dedicated field like 'target'
  // For 'conditional' mode, structure might be different, e.g., condition rules
  // For now, 'targets' is a flexible array.
}

export interface RetryPolicy {
  retries?: number; // Number of retries
  timeout?: number; // Timeout in milliseconds
  backoff_factor?: number; // Exponential backoff factor
  // Other retry options
}

// This is the structure that gets stringified into the x-portkey-config header
export interface PortkeyConfig {
  strategy?: Strategy;
  retry?: RetryPolicy;
  // Other top-level config options like 'cache', 'metadata', etc.
  // For now, focusing on strategy and retry
}

// --- UI Specific Config Object (stored by the backend) ---
// This would typically have an ID, name, and the PortkeyConfig object itself.
export interface NamedConfig {
  id: string;
  name: string;
  description?: string;
  config: PortkeyConfig; // The actual x-portkey-config structure
  createdAt: string;
  updatedAt: string;
}

export type NamedConfigInput = Omit<NamedConfig, 'id' | 'createdAt' | 'updatedAt'>;

const API_BASE_URL = '/v1';

// --- API Hooks ---

// Fetch all named configs
export const useGetConfigs = () => {
  return useQuery<NamedConfig[], Error>({
    queryKey: ['configs'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/configs`);
      if (!response.ok) {
        throw new Error('Failed to fetch configs');
      }
      return response.json();
    },
  });
};

// Fetch a single named config by ID (if needed, e.g., for a dedicated edit page)
export const useGetConfig = (id: string | null) => {
  return useQuery<NamedConfig, Error>({
    queryKey: ['configs', id],
    queryFn: async () => {
      if (!id) throw new Error("No ID provided");
      const response = await fetch(`${API_BASE_URL}/configs/${id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch config ${id}`);
      }
      return response.json();
    },
    enabled: !!id, // Only run if id is not null
  });
};


// Add a new named config
export const useAddConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<NamedConfig, Error, NamedConfigInput>({
    mutationFn: async (newConfig) => {
      const response = await fetch(`${API_BASE_URL}/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to add config' }));
        throw new Error(errorData.message || 'Failed to add config');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] });
    },
  });
};

// Update an existing named config
export const useUpdateConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<NamedConfig, Error, NamedConfig & { id: string }>({
    mutationFn: async (updatedConfig) => {
      const response = await fetch(`${API_BASE_URL}/configs/${updatedConfig.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update config' }));
        throw new Error(errorData.message || 'Failed to update config');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] });
    },
  });
};

// Delete a named config
export const useDeleteConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({ // string for configId
    mutationFn: async (configId) => {
      const response = await fetch(`${API_BASE_URL}/configs/${configId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete config' }));
        throw new Error(errorData.message || 'Failed to delete config');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] });
    },
  });
};
