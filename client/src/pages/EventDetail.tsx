import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface LeaderboardEntry { id: string; playerId: string; playerName: string; score: number; }
interface GameEvent {
  id: string; type: string; title: string; state: string;
  scheduledAt: string; endedAt?: string; participantCount: number;
  config: Record<string, unknown>;
  leaderboard: LeaderboardEntry[];
}

const STATE_BADGE: Record<string, string> = {
  UPCOMING: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  FINISHED: 'bg-gray-100 text-gray-600',
};

const TYPE_LABEL: Record<string, string> = {
  BOSS_RAID: 'Boss Raid',
  TREASURE_HUNT: 'Treasure Hunt',
  BUILD_BATTLE: 'Build Battle',
  CLAN_WAR: 'Clan War',
};

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const { data: event, isLoading, error } = useQuery<GameEvent>({
    queryKey: ['events', id],
    queryFn: () => api.get(`/events/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.state === 'ACTIVE' ? 5_000 : false,
  });

  const action = useMutation({
    mutationFn: (a: 'start' | 'end') => api.patch(`/events/${id}`, { action: a }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });

  if (isLoading) return <div className="p-6 text-gray-500 text-sm">Loading…</div>;
  if (error || !event) return (
    <div className="p-6">
      <p className="text-red-500 text-sm mb-4">Event not found.</p>
      <Link to="/events" className="text-blue-600 text-sm hover:underline">← Back to Events</Link>
    </div>
  );

  const isActive = event.state === 'ACTIVE';
  const isUpcoming = event.state === 'UPCOMING';

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/events" className="text-blue-600 text-sm hover:underline">← Events</Link>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATE_BADGE[event.state] ?? ''}`}>
          {event.state}
        </span>
        {isActive && (
          <span className="text-xs text-green-600 font-medium animate-pulse">● Live</span>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
            <p className="text-gray-500 text-sm mt-1">{TYPE_LABEL[event.type] ?? event.type}</p>
          </div>
          {isAdmin && (isActive || isUpcoming) && (
            <div className="flex gap-2">
              {isUpcoming && (
                <button
                  onClick={() => action.mutate('start')}
                  disabled={action.isPending}
                  className="text-sm px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Launch Now
                </button>
              )}
              {isActive && (
                <button
                  onClick={() => action.mutate('end')}
                  disabled={action.isPending}
                  className="text-sm px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  End Event
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div><span className="font-medium text-gray-700">Participants:</span> {event.participantCount}</div>
          <div><span className="font-medium text-gray-700">Scheduled:</span> {new Date(event.scheduledAt).toLocaleString()}</div>
          {event.endedAt && (
            <div><span className="font-medium text-gray-700">Ended:</span> {new Date(event.endedAt).toLocaleString()}</div>
          )}
        </div>

        {Object.keys(event.config ?? {}).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Configuration</p>
            <pre className="bg-gray-50 rounded p-3 text-xs text-gray-700 overflow-auto">
              {JSON.stringify(event.config, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {event.leaderboard.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Leaderboard</h2>
            {isActive && (
              <span className="text-xs text-gray-400">Auto-refreshes every 5s</span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {event.leaderboard.map((entry, idx) => (
                <tr key={entry.id} className={idx < 3 ? 'bg-yellow-50/50' : ''}>
                  <td className="px-4 py-3 text-gray-400 font-mono">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </td>
                  <td className="px-4 py-3 font-medium">{entry.playerName}</td>
                  <td className="px-4 py-3 text-right font-mono">{entry.score.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
