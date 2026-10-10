import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export const useBranches = (params?: any) => {
  return useQuery({
    queryKey: ['branches', params],
    queryFn: () => apiClient.get('/branches', { params }).then(res => res.data),
  });
};
