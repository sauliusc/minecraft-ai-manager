import axios, { AxiosRequestConfig } from 'axios';
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

// Queue of requests waiting on an in-flight token refresh
type QueueEntry = { resolve: (token: string | null) => void };
let refreshPromise: Promise<string | null> | null = null;
const waitingQueue: QueueEntry[] = [];

function drainQueue(token: string | null) {
  waitingQueue.splice(0).forEach(({ resolve }) => resolve(token));
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original: AxiosRequestConfig & { _retry?: boolean } = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // If a refresh is already running, queue this request until it resolves
    if (refreshPromise) {
      return new Promise((resolve, reject) => {
        waitingQueue.push({
          resolve: (token) => {
            if (!token) return reject(error);
            original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
            resolve(api(original));
          },
        });
      });
    }

    original._retry = true;
    refreshPromise = axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then((r) => {
        if (r.data.user) {
          useAuthStore.getState().login(r.data.accessToken, r.data.user);
        }
        return r.data.accessToken as string;
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null; });

    const refreshResult = await refreshPromise;
    drainQueue(refreshResult);

    if (refreshResult) {
      useAuthStore.getState().setAccessToken(refreshResult);
      original.headers = { ...original.headers, Authorization: `Bearer ${refreshResult}` };
      return api(original);
    }

    useAuthStore.getState().logout();
    return Promise.reject(error);
  }
);
