import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';

export function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: versionData } = useQuery<{ version: string; gitSha: string }>({
    queryKey: ['app-version'],
    queryFn: () => api.get('/version').then((r) => r.data),
    staleTime: Infinity,
  });

  const handleLogout = async () => {
    await api.post('/auth/logout').catch(() => {});
    logout();
    navigate('/login');
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canConfirm = user?.autoConfirm === true;

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col">
        <div className="px-4 py-5 text-lg font-bold tracking-wide border-b border-gray-700">
          CraftControl
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          <Link to="/" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Dashboard
          </Link>
          <Link to="/players" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Players
          </Link>
          <Link to="/challenges" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Challenges
          </Link>
          <Link to="/rewards" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Rewards
          </Link>
          <Link to="/events" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Events
          </Link>
          <Link to="/moderation" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Moderation
          </Link>
          <Link to="/analytics" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Analytics
          </Link>
          <Link to="/broadcast" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Broadcast
          </Link>
          <Link to="/npcs" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            NPCs
          </Link>
          <Link to="/cosmetics" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Cosmetics
          </Link>
          <Link to="/clans" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
            Clans
          </Link>
          <div className="border-t border-gray-700 my-2" />
          <Link to="/server" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm font-medium text-green-400">
            Minecraft Server
          </Link>
          <Link to="/ai" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm font-medium text-indigo-400">
            AI Features
          </Link>
          <Link to="/ai/week-theme" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm pl-6 text-indigo-300">
            Week Theme
          </Link>
          {(isSuperAdmin || canConfirm) && (
            <>
              <div className="border-t border-gray-700 my-2" />
              <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Administration</p>
              {isSuperAdmin && (
                <>
                  <Link to="/settings/users" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
                    Users
                  </Link>
                  <Link to="/activity-log" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
                    Activity Log
                  </Link>
                </>
              )}
              {canConfirm && (
                <Link to="/pending-actions" className="flex items-center px-3 py-2 rounded hover:bg-gray-700 text-sm">
                  Pending Actions
                </Link>
              )}
            </>
          )}
        </nav>
        <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-400">
          <div className="flex items-center gap-2 mb-1">
            <p className="truncate font-medium text-gray-300">{user?.name || user?.email}</p>
            {user?.role === 'SUPER_ADMIN' ? (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-xs bg-purple-800 text-purple-200">SA</span>
            ) : (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-xs bg-blue-800 text-blue-200">MOD</span>
            )}
          </div>
          {user?.name && <p className="truncate text-gray-500">{user.email}</p>}
          <button onClick={handleLogout} className="mt-1 text-red-400 hover:text-red-300">
            Sign out
          </button>
          {versionData && (
            <p className="mt-2 text-gray-600 font-mono">
              v{versionData.version}
              <span className="ml-1 text-gray-700">{versionData.gitSha}</span>
            </p>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
