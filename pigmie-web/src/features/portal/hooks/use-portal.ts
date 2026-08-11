import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export const usePortalDashboard = () => {
  return useQuery({
    queryKey: ['portal', 'dashboard'],
    queryFn: () => apiClient.get('/portal/dashboard').then(r => r.data),
  });
};

export const usePortalLoanDetails = (loanId: string) => {
  return useQuery({
    queryKey: ['portal', 'loan', loanId],
    queryFn: () => apiClient.get(`/portal/loans/${loanId}`).then(r => r.data),
    enabled: !!loanId,
  });
};
