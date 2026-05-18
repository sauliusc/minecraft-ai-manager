import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface ServerStatus {
  state: string;
  players: string[];
  playerCount: number;
  tps: number[] | null;
  uptime: string | null;
}

interface PlayersMeta {
  meta: { total: number };
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function StateChip({ state }: { state: string }) {
  const map: Record<string, string> = {
    running: 'bg-green-100 text-green-700',
    starting: 'bg-yellow-100 text-yellow-700',
    stopped: 'bg-red-100 text-red-700',
    not_found: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[state] ?? 'bg-gray-100 text-gray-500'}`}>
      {state}
    </span>
  );
}

export function Dashboard() {
  const { data: status } = useQuery<ServerStatus>({
    queryKey: ['minecraft-status'],
    queryFn: () => api.get('/minecraft/status').then((r) => r.data),
    refetchInterval: 10_000,
  });

  const { data: playersData } = useQuery<PlayersMeta>({
    queryKey: ['players-meta'],
    queryFn: () => api.get('/players', { params: { limit: 1 } }).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const tpsColor = (t: number) =>
    t >= 19 ? 'text-green-600' : t >= 15 ? 'text-yellow-500' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        {status && <StateChip state={status.state} />}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Online now"
          value={status?.playerCount ?? '—'}
          sub={status?.uptime ?? undefined}
        />
        <StatCard
          label="Registered players"
          value={playersData?.meta?.total ?? '—'}
        />
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">TPS (1m / 5m / 15m)</p>
          {status?.tps ? (
            <p className="text-xl font-bold mt-1">
              {status.tps.map((t, i) => (
                <span key={i} className={tpsColor(t)}>
                  {t.toFixed(1)}{i < 2 ? ' / ' : ''}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-2xl font-bold text-gray-400 mt-1">—</p>
          )}
        </div>
        <StatCard
          label="Server"
          value={status?.state === 'running' ? 'Online' : status?.state ?? '—'}
        />
      </div>

      {/* Online players */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Online Players ({status?.playerCount ?? 0})
        </h2>
        {!status || status.state !== 'running' ? (
          <p className="text-sm text-gray-400">Server is not running.</p>
        ) : status.players.length === 0 ? (
          <p className="text-sm text-gray-400">No players online.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {status.players.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 rounded-full text-sm text-green-800 font-medium"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
