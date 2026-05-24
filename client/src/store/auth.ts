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
  hydrating: boolean;
  login: (token: string, user: User) => void;
  setAccessToken: (token: string) => void;
  setHydrating: (hydrating: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  hydrating: true,
  login: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setHydrating: (hydrating) => set({ hydrating }),
  logout: () => set({ user: null, accessToken: null }),
}));
