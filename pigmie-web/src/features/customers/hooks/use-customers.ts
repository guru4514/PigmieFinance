import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface Customer {
  id: string;
  fullName: string;
  email?: string;
  phone: string;
  address?: string;
  isActive: boolean;
  createdAt?: string;
  totalLoans?: number;
}

export const useCustomers = (params?: any) => {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => apiClient.get('/customers', { params }).then(r => r.data),
  });
};

export const useCustomer = (id: string) => {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => apiClient.get(`/customers/${id}`).then(r => r.data),
    enabled: !!id,
  });
};

import { toast } from 'sonner';

export const useCreateCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Customer>) => 
      apiClient.post('/customers', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer created successfully');
    },
    onError: (error: any) => {
      toast.error((error?.response?.data?.error?.message || (error?.response?.data?.error?.message || error?.response?.data?.message)) || 'Failed to create customer');
    }
  });
};

export const useUpdateCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Customer> }) => 
      apiClient.patch(`/customers/${id}`, data).then(r => r.data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers', id] });
      toast.success('Customer updated successfully');
    },
    onError: (error: any) => {
      toast.error((error?.response?.data?.error?.message || (error?.response?.data?.error?.message || error?.response?.data?.message)) || 'Failed to update customer');
    }
  });
};

export const useDeleteCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/customers/${id}`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer deleted successfully');
    },
    onError: (error: any) => {
      toast.error((error?.response?.data?.error?.message || (error?.response?.data?.error?.message || error?.response?.data?.message)) || 'Failed to delete customer');
    }
  });
};

export const useCustomerLoans = (id: string) => {
  return useQuery({
    queryKey: ['customers', id, 'loans'],
    queryFn: () => apiClient.get(`/customers/${id}/loans`).then(r => r.data),
    enabled: !!id,
  });
};
