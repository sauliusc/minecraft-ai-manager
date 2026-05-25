import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/auth.js';

const SERVER_ADDRESS = '78.63.139.139';

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registerAvailable, setRegisterAvailable] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    axios.get('/api/auth/register-available').then((r) => {
      setRegisterAvailable(r.data.available === true);
    }).catch(() => {});
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(SERVER_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { email, password }, { withCredentials: true });
      login(res.data.accessToken, res.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 gap-4 px-4">

      {/* ── Minecraft server address card ── */}
      <div className="bg-white rounded-lg shadow p-6 w-full max-w-sm text-center border-t-4 border-green-500">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-2xl">⛏</span>
          <h2 className="text-lg font-bold text-gray-800">Join the Server</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">Open Minecraft → Multiplayer → Add Server</p>
        <div className="flex items-center justify-between bg-gray-100 rounded px-3 py-2 font-mono text-base font-semibold text-gray-800">
          <span>{SERVER_ADDRESS}</span>
          <button
            onClick={handleCopy}
            className="ml-3 text-xs font-sans font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── Admin login card ── */}
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">CraftControl</h1>
        {registerAvailable && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            No admin account exists yet.{' '}
            <Link to="/register" className="underline font-medium">
              Create the first admin account
            </Link>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
