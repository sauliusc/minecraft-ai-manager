import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface Clan {
  id: string;
  name: string;
  tag: string;
  level: number;
  xp: number;
  memberCount: number;
  createdAt: string;
}

interface ClanWar {
  id: string;
  clan1Id: string;
  clan2Id: string;
  type: string;
  winnerId: string | null;
  durationMs: number;
  startedAt: string;
  endedAt: string | null;
}

export function Clans() {
  const [page, setPage] = useState(1);
  const [selectedClan, setSelectedClan] = useState<Clan | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['clans', page],
    queryFn: () => api.get('/clans', { params: { page, limit: 20 } }).then((r) => r.data),
    placeholderData: (p) => p,
  });

  const { data: wars, isLoading: warsLoading } = useQuery<ClanWar[]>({
    queryKey: ['clan-wars', selectedClan?.id],
    queryFn: () => api.get(`/clans/${selectedClan!.id}/wars`).then((r) => r.data.wars),
    enabled: !!selectedClan,
  });

  const clans: Clan[] = data?.data ?? [];

  function warResult(war: ClanWar, clanId: string) {
    if (!war.winnerId) return 'Draw';
    return war.winnerId === clanId ? 'Win' : 'Loss';
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Clans</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Clan list */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-gray-800">All Clans</h2>
          </div>
          {isLoading ? (
            <div className="p-6 text-center text-gray-400">Loading…</div>
          ) : clans.length === 0 ? (
            <div className="p-6 text-center text-gray-400">No clans found.</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Clan</th>
                    <th className="px-4 py-2 text-left">Lvl</th>
                    <th className="px-4 py-2 text-left">XP</th>
                    <th className="px-4 py-2 text-center">Members</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clans.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedClan(c)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedClan?.id === c.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-2">
                        <span className="font-medium text-gray-800">{c.name}</span>
                        <span className="ml-1 text-xs text-gray-400">[{c.tag}]</span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{c.level}</td>
                      <td className="px-4 py-2 text-gray-600">{c.xp.toLocaleString()}</td>
                      <td className="px-4 py-2 text-center text-gray-600">{c.memberCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {data?.meta && (
                <div className="px-4 py-3 border-t flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {data.meta.total === 0 ? 'No results' : `${data.meta.total} total`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(data.meta.pages, p + 1))}
                      disabled={page >= data.meta.pages}
                      className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* War history panel */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-gray-800">
              {selectedClan ? `${selectedClan.name} — War History` : 'Select a clan to view wars'}
            </h2>
          </div>
          {!selectedClan ? (
            <div className="p-6 text-center text-gray-400 text-sm">Click a clan on the left.</div>
          ) : warsLoading ? (
            <div className="p-6 text-center text-gray-400">Loading…</div>
          ) : !wars || wars.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No war history.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Opponent</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-center">Result</th>
                  <th className="px-4 py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {wars.map((w) => {
                  const result = warResult(w, selectedClan.id);
                  const opponentId = w.clan1Id === selectedClan.id ? w.clan2Id : w.clan1Id;
                  return (
                    <tr key={w.id}>
                      <td className="px-4 py-2 text-xs text-gray-500 font-mono">{opponentId.slice(0, 8)}…</td>
                      <td className="px-4 py-2 text-gray-600">{w.type.replace('_', ' ')}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs font-medium ${
                          result === 'Win' ? 'text-green-600' : result === 'Loss' ? 'text-red-500' : 'text-gray-400'
                        }`}>
                          {result}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">
                        {new Date(w.startedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
