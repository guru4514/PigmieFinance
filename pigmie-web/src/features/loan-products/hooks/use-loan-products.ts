import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface LoanProduct {
  id: string;
  name: string;
  interestType: 'flat' | 'reducing';
  interestRateAnnual: number;
  collectionFrequency: 'daily' | 'weekly' | 'monthly';
  minAmount: number;
  maxAmount: number;
  minTenure: number;
  maxTenure: number;
  processingFee?: number;
  status: 'active' | 'inactive';
}

export const useLoanProducts = () => {
  return useQuery({
    queryKey: ['loan-products'],
    queryFn: () => apiClient.get('/loan-products').then(r => r.data),
  });
};

import { toast } from 'sonner';

export const useCreateLoanProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<LoanProduct, 'id'>) => 
      apiClient.post('/loan-products', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-products'] });
      toast.success('Loan product created successfully');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to create loan product')
  });
};

export const useUpdateLoanProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LoanProduct> }) => 
      apiClient.patch(`/loan-products/${id}`, data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-products'] });
      toast.success('Loan product updated successfully');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to update loan product')
  });
};

export const useDeleteLoanProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/loan-products/${id}`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-products'] });
      toast.success('Loan product deleted successfully');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to delete loan product')
  });
};
