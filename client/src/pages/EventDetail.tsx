import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface LeaderboardEntry { id: string; playerId: string; playerName: string; score: number; }
interface GameEvent {
  id: string; type: string; title: string; state: string;
  scheduledAt: string; endedAt?: string; participantCount: number;
  leaderboard: LeaderboardEntry[];
}

const STATE_BADGE: Record<string, string> = {
  UPCOMING: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  FINISHED: 'bg-gray-100 text-gray-600',
};

export function EventDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: event, isLoading, error } = useQuery<GameEvent>({
    queryKey: ['events', id],
    queryFn: () => api.get(`/events/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-gray-500 text-sm">Loading…</div>;
  if (error || !event) return (
    <div className="p-6">
      <p className="text-red-500 text-sm mb-4">Event not found.</p>
      <Link to="/events" className="text-blue-600 text-sm hover:underline">← Back to Events</Link>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/events" className="text-blue-600 text-sm hover:underline">← Events</Link>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATE_BADGE[event.state] ?? ''}`}>
          {event.state}
        </span>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-3">
        <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div><span className="font-medium">Type:</span> {event.type}</div>
          <div><span className="font-medium">Participants:</span> {event.participantCount}</div>
          <div><span className="font-medium">Scheduled:</span> {new Date(event.scheduledAt).toLocaleString()}</div>
          {event.endedAt && (
            <div><span className="font-medium">Ended:</span> {new Date(event.endedAt).toLocaleString()}</div>
          )}
        </div>
      </div>

      {event.leaderboard.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-gray-900">Leaderboard</h2>
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
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-gray-400 font-mono">{idx + 1}</td>
                  <td className="px-4 py-3">{entry.playerName}</td>
                  <td className="px-4 py-3 text-right font-mono">{entry.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
