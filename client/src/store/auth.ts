import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  autoConfirm: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  login: (token: string, user: User) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  login: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  logout: () => set({ user: null, accessToken: null }),
}));
