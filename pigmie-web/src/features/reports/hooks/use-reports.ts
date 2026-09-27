import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export const usePortfolioAtRisk = () => {
  return useQuery({
    queryKey: ['reports', 'portfolio-at-risk'],
    queryFn: () => apiClient.get('/reports/portfolio-at-risk').then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });
};

export const useCollectionEfficiency = (startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ['reports', 'collection-efficiency', startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      return apiClient.get(`/reports/collection-efficiency?${params.toString()}`).then(r => {
        const d = r.data;
        return Array.isArray(d) ? d : (d?.data ?? []);
      });
    },
  });
};

export const useAgentPerformance = () => {
  return useQuery({
    queryKey: ['reports', 'agent-performance'],
    queryFn: () => apiClient.get('/reports/agent-performance').then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });
};

export const useExportReport = () => {
  return useMutation({
    mutationFn: async (type: 'par' | 'collections' | 'agents') => {
      const response = await apiClient.get(`/reports/export?type=${type}`, {
        responseType: 'blob'
      });
      return response.data;
    },
    onSuccess: (blob, type) => {
      // Create a link to download the blob
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
};
