import { useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/auth.js';

/**
 * On mount, attempts a silent token refresh using the HttpOnly refresh cookie.
 * If successful, restores the auth state so the user doesn't need to log in
 * again after a page refresh.
 * Sets `hydrating = false` when done (success or failure) so ProtectedRoute
 * can decide whether to show the app or redirect to /login.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { login, setHydrating } = useAuthStore();

  useEffect(() => {
    axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then((r) => {
        login(r.data.accessToken, r.data.user);
      })
      .catch(() => {
        // No valid refresh token — user must log in manually
      })
      .finally(() => {
        setHydrating(false);
      });
  }, []); // run once on mount only

  return <>{children}</>;
}
