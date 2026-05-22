import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

interface Player {
  username: string;
  tier: string;
  lastSeenAt: string;
  joinCount: number;
}

const TIER_COLORS: Record<string, string> = {
  New: 'bg-gray-100 text-gray-600',
  Regular: 'bg-blue-100 text-blue-700',
  Veteran: 'bg-purple-100 text-purple-700',
  Legend: 'bg-yellow-100 text-yellow-700',
};

export function Players() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['players', page, search],
    queryFn: () =>
      api.get('/players', { params: { page, limit: 20, search: search || undefined } }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Players</h1>
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <input
            type="search"
            placeholder="Search by username…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Username</th>
              <th className="px-4 py-3 text-left">Tier</th>
              <th className="px-4 py-3 text-left">Last seen</th>
              <th className="px-4 py-3 text-right">Joins</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : isError ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-red-500">Failed to load players.</td></tr>
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No players found.</td></tr>
            ) : data?.data?.map((p: Player) => (
              <tr
                key={p.username}
                onClick={() => navigate(`/players/${p.username}`)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-gray-800">{p.username}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[p.tier] ?? ''}`}>
                    {p.tier}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(p.lastSeenAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{p.joinCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.meta && (
          <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
            <span>
              Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.meta.total)} of {data.meta.total}
            </span>
            <div className="space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.meta.pages, p + 1))}
                disabled={page >= data.meta.pages}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
