import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { useAuth } from '@/shared/hooks/use-auth';
import { getCollectionOwner, submitCollection, type CollectionInput } from '@/shared/lib/offline-queue';

export function useDueToday(date?: string) {
  return useQuery({
    queryKey: ['collections', 'due-today', date],
    queryFn: () => apiClient.get('/collections/due-today', { params: date ? { date } : undefined }).then(r => r.data),
  });
}

export const useCollectionsToday = useDueToday;

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: () => apiClient.get('/collections').then(r => r.data),
  });
}

export function useLoan(loanId: string) {
  return useQuery({
    queryKey: ['loans', loanId],
    queryFn: () => apiClient.get(`/loans/${loanId}`).then(r => r.data),
    enabled: !!loanId,
  });
}

export function useRecordCollection(loanId?: string) {
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  
  return useMutation({
    mutationFn: (data: CollectionInput) => {
      const owner = getCollectionOwner(session?.user.id, user);
      if (!owner) throw new Error('Sign in with a staff account before recording a collection.');
      return submitCollection(data, owner);
    },
    onSuccess: (result) => {
      if (result.status !== 'recorded') return;
      if (loanId) {
        queryClient.invalidateQueries({ queryKey: ['loans', loanId] });
      }
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['collections', 'due-today'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'dashboard-summary'] });
    },
  });
}

export function useSyncCollections() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => apiClient.post('/collections/sync', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}
