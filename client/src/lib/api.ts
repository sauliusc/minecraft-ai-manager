import axios from 'axios';
import { useAuthStore } from '../store/auth.js';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshing) {
        refreshing = axios
          .post('/api/auth/refresh', {}, { withCredentials: true })
          .then((r) => r.data.accessToken as string)
          .catch(() => null)
          .finally(() => { refreshing = null; });
      }
      const token = await refreshing;
      if (token) {
        useAuthStore.getState().setAccessToken(token);
        original.headers.Authorization = `Bearer ${token}`;
        return axios(original);
      }
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
