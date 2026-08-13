import axios from 'axios';
import { supabase } from './supabase';

declare module 'axios' {
  export interface AxiosInstance {
    loans: {
      restructureLoan: (id: string, data: { fromInstallmentNumber: number; newTenure: number; reason?: string }) => Promise<any>;
      downloadLoanStatement: (id: string) => Promise<Blob>;
    };
    collections: {
      reverseCollection: (id: string, data: { reason: string }) => Promise<any>;
    };
  }
}

export const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1' });

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Optionally handle global errors (e.g., 401 logout)
    return Promise.reject(error);
  }
);

apiClient.loans = {
  restructureLoan: (id: string, data: { fromInstallmentNumber: number; newTenure: number; reason?: string }) => 
    apiClient.post(`/loans/${id}/restructure`, data).then((res) => res.data),
  downloadLoanStatement: async (id: string) => {
    const response = await apiClient.get(`/loans/${id}/statement`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

apiClient.collections = {
  reverseCollection: (id: string, data: { reason: string }) =>
    apiClient.post(`/collections/${id}/reverse`, data).then((res) => res.data),
};
