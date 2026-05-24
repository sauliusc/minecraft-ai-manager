import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.accessToken);
  const hydrating = useAuthStore((s) => s.hydrating);

  if (hydrating) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
      </div>
    );
  }

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
