import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { agentPerformanceSchema, collectionEfficiencySchema, portfolioRiskSchema } from '../utils/report-contracts';
import { toast } from 'sonner';

export const usePortfolioAtRisk = () => {
  return useQuery({
    queryKey: ['reports', 'portfolio-at-risk'],
    queryFn: () => apiClient.get('/reports/portfolio-at-risk').then(r => {
      return portfolioRiskSchema.parse(r.data);
    }),
  });
};

export const useCollectionEfficiency = (dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ['reports', 'collection-efficiency', dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      return apiClient.get(`/reports/collection-efficiency?${params.toString()}`).then(r => {
        return collectionEfficiencySchema.parse(r.data).data;
      });
    },
  });
};

export const useAgentPerformance = () => {
  return useQuery({
    queryKey: ['reports', 'agent-performance'],
    queryFn: () => apiClient.get('/reports/agent-performance').then(r => {
      return agentPerformanceSchema.parse(r.data).data;
    }),
  });
};

export const useExportReport = () => {
  return useMutation({
    mutationFn: async (type: 'par' | 'collections' | 'agents') => {
      const exportType = type === 'collections' ? 'efficiency' : type;
      const response = await apiClient.get(`/reports/export?type=${exportType}&format=csv`, {
        responseType: 'blob'
      });
      return response.data;
    },
    onError: () => toast.error('Could not export the report. Please retry.'),
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
