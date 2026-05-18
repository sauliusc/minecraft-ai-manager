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

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col">
        <div className="px-4 py-5 text-lg font-bold tracking-wide border-b border-gray-700">
          CraftControl
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
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
        </nav>
        <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-400">
          <p className="truncate">{user?.email}</p>
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
