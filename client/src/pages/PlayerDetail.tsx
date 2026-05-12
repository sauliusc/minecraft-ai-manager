import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'challenges' | 'rewards'>('challenges');

  const { data: player, isLoading } = useQuery({
    queryKey: ['player', id],
    queryFn: () => api.get(`/players/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-gray-400 p-8">Loading…</div>;
  if (!player) return <div className="text-red-500 p-8">Player not found</div>;

  return (
    <div>
      <button onClick={() => navigate('/players')} className="text-sm text-blue-600 hover:underline mb-4">
        ← Back to players
      </button>
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{player.username}</h1>
            <p className="text-gray-500 text-sm mt-1">UUID: {player.id}</p>
          </div>
          <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
            {player.tier}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
          <div>
            <p className="text-gray-500">First joined</p>
            <p className="font-medium">{new Date(player.firstJoinAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Last seen</p>
            <p className="font-medium">{new Date(player.lastSeenAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Total joins</p>
            <p className="font-medium">{player.joinCount}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b flex">
          {(['challenges', 'rewards'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize ${
                tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'challenges' && (
            <table className="w-full text-sm">
              <thead className="text-gray-500 uppercase text-xs">
                <tr>
                  <th className="text-left py-2">Challenge</th>
                  <th className="text-left py-2">Progress</th>
                  <th className="text-left py-2">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {player.progress?.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-gray-400">No challenges</td></tr>
                )}
                {player.progress?.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-2">{p.challenge.title}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, p.current)}%` }}
                          />
                        </div>
                        <span>{p.current}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      {p.completed ? (
                        <span className="text-green-600 text-xs">✓ {new Date(p.completedAt).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">In progress</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'rewards' && (
            <table className="w-full text-sm">
              <thead className="text-gray-500 uppercase text-xs">
                <tr>
                  <th className="text-left py-2">Reward</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Granted at</th>
                  <th className="text-left py-2">Granted by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {player.rewards?.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-gray-400">No rewards</td></tr>
                )}
                {player.rewards?.map((r: any) => (
                  <tr key={r.id}>
                    <td className="py-2">{r.reward.name}</td>
                    <td className="py-2 text-gray-500">{r.reward.type}</td>
                    <td className="py-2 text-gray-500">{new Date(r.grantedAt).toLocaleDateString()}</td>
                    <td className="py-2 text-gray-500">{r.grantedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
