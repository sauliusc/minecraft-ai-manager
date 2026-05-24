import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

export function RequireSuperAdmin() {
  const user = useAuthStore((s) => s.user);
  if (!user || user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export function RequireAutoConfirm() {
  const user = useAuthStore((s) => s.user);
  if (!user || !user.autoConfirm) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
