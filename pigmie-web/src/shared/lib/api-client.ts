import axios from 'axios';
import { supabase } from './supabase';

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
