import axios from 'axios';
import { supabase } from './supabase';

export interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  type: string;
}

declare module 'axios' {
  export interface AxiosInstance {
    loans: {
      restructureLoan: (id: string, data: { fromInstallmentNumber: number; newTenure: number; reason?: string }) => Promise<any>;
      downloadLoanStatement: (id: string) => Promise<Blob>;
    };
    collections: {
      reverseCollection: (id: string, data: { reason: string }) => Promise<any>;
    };
    notifications: {
      getNotifications: (params?: any) => Promise<Notification[]>;
      markAsRead: (id: string) => Promise<any>;
      markAllAsRead: () => Promise<any>;
      getVapidPublicKey: () => Promise<{ publicKey: string }>;
      subscribe: (subscription: PushSubscriptionJSON) => Promise<any>;
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

apiClient.notifications = {
  getNotifications: (params) => apiClient.get('/notifications', { params }).then((res) => res.data?.data ?? res.data),
  markAsRead: (id: string) => apiClient.patch(`/notifications/${id}/read`).then((res) => res.data),
  markAllAsRead: () => apiClient.patch('/notifications/read-all').then((res) => res.data),
  getVapidPublicKey: () => apiClient.get('/notifications/vapid-public-key').then((res) => res.data),
  subscribe: (subscription: PushSubscriptionJSON) => apiClient.post('/notifications/subscribe', subscription).then((res) => res.data),
};
