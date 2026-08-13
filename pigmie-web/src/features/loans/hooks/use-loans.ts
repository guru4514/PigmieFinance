import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export type LoanStatus = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'CLOSED' | 'DEFAULTED' | 'WRITTEN_OFF' | 'REJECTED';

export interface Loan {
  id: string;
  customerId: string;
  loanProductId: string;
  principalAmount: number;
  tenure: number;
  status: LoanStatus;
  remainingBalance: number;
  startDate?: string;
  endDate?: string;
  nextPaymentDate?: string;
  nextPaymentAmount?: number;
  customer?: {
    fullName: string;
  };
  loanProduct?: {
    interestRateAnnual: number;
  };
  amount?: number; // fallback
}

export const useLoans = (params?: any) => {
  return useQuery({
    queryKey: ['loans', params],
    queryFn: () => apiClient.get('/loans', { params }).then(r => r.data),
  });
};

export const useLoanDetails = (id: string) => {
  return useQuery({
    queryKey: ['loans', id],
    queryFn: () => apiClient.get(`/loans/${id}`).then(r => r.data),
    enabled: !!id,
  });
};

export const useLoan = useLoanDetails;

import { toast } from 'sonner';

export const useCreateLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.post('/loans', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      toast.success('Loan created successfully');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to create loan')
  });
};

export const useApproveLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/loans/${id}/approve`).then(r => r.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans', id] });
      toast.success('Loan approved');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to approve loan')
  });
};

export const useRejectLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/loans/${id}/reject`).then(r => r.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans', id] });
      toast.success('Loan rejected');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to reject loan')
  });
};

export const useDisburseLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/loans/${id}/disburse`).then(r => r.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans', id] });
      toast.success('Loan disbursed successfully');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to disburse loan')
  });
};

export const useCloseLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/loans/${id}/close`).then(r => r.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans', id] });
      toast.success('Loan closed');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to close loan')
  });
};

export const useWriteOffLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/loans/${id}/write-off`).then(r => r.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans', id] });
      toast.success('Loan written off');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to write off loan')
  });
};

export const useLoanSchedule = (loanId: string) => {
  return useQuery({
    queryKey: ['loans', loanId, 'schedule'],
    queryFn: () => apiClient.get(`/loans/${loanId}/schedule`).then(r => r.data),
    enabled: !!loanId,
  });
};

export const useRestructureLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string, data: { fromInstallmentNumber: number; newTenure: number; reason?: string } }) => 
      apiClient.loans.restructureLoan(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans', id] });
      toast.success('Loan restructured successfully');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to restructure loan')
  });
};
