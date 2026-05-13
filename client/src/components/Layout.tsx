import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';

export function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

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
        </nav>
        <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-400">
          <p className="truncate">{user?.email}</p>
          <button onClick={handleLogout} className="mt-1 text-red-400 hover:text-red-300">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
