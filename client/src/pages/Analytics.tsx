import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface RetentionData {
  dau: number;
  wau: number;
  mau: number;
  total: number;
  funnel: {
    joined: number;
    firstChallenge: number;
    firstReward: number;
  };
}

interface ChallengeMetric {
  id: string;
  title: string;
  type: string;
  attempts: number;
  completions: number;
  completionRate: number;
  flag: 'TOO_HARD' | 'TOO_EASY' | null;
}

interface EconomyData {
  topRecipients: { playerId: string; username: string; grantCount: number }[];
  popularRewards: { rewardId: string; name: string; grantCount: number }[];
}

interface ChurnPlayer {
  id: string;
  username: string;
  lastSeenAt: string;
  joinCount: number;
}

interface HeatmapData {
  cells: { day: number; hour: number; count: number }[];
  periodDays: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Heatmap({ data }: { data: HeatmapData }) {
  const max = Math.max(...data.cells.map((c) => c.count), 1);
  const cellMap = new Map(data.cells.map((c) => [`${c.day}:${c.hour}`, c.count]));

  return (
    <div className="bg-white rounded-lg shadow p-5 overflow-x-auto">
      <p className="text-xs text-gray-400 mb-3">
        Activity by hour (UTC) × day of week — last {data.periodDays} days
      </p>
      <div className="flex gap-px">
        {/* Y-axis labels */}
        <div className="flex flex-col gap-px pt-5">
          {DAY_LABELS.map((d) => (
            <div key={d} className="h-5 w-7 flex items-center text-xs text-gray-400">{d}</div>
          ))}
        </div>
        {/* Grid */}
        <div>
          {/* Hour labels */}
          <div className="flex gap-px mb-0.5">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="w-5 text-center text-xs text-gray-300">
                {h % 6 === 0 ? h : ''}
              </div>
            ))}
          </div>
          {DAY_LABELS.map((_, day) => (
            <div key={day} className="flex gap-px mb-px">
              {Array.from({ length: 24 }, (_, hour) => {
                const count = cellMap.get(`${day}:${hour}`) ?? 0;
                const intensity = Math.round((count / max) * 4);
                const bg = ['bg-gray-100', 'bg-indigo-100', 'bg-indigo-300', 'bg-indigo-500', 'bg-indigo-700'][intensity];
                return (
                  <div
                    key={hour}
                    title={`${DAY_LABELS[day]} ${hour}:00 — ${count} completions`}
                    className={`w-5 h-5 rounded-sm ${bg} cursor-default`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{count} <span className="text-gray-400">({pct}%)</span></span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const FLAG_BADGE: Record<string, string> = {
  TOO_HARD: 'bg-red-100 text-red-700',
  TOO_EASY: 'bg-yellow-100 text-yellow-700',
};

function daysAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  return Math.floor(diff / 86_400_000);
}

export function Analytics() {
  const retention = useQuery<RetentionData>({
    queryKey: ['analytics', 'retention'],
    queryFn: () => api.get('/analytics/retention').then((r) => r.data),
  });

  const challenges = useQuery<ChallengeMetric[]>({
    queryKey: ['analytics', 'challenges'],
    queryFn: () => api.get('/analytics/challenges').then((r) => r.data),
  });

  const economy = useQuery<EconomyData>({
    queryKey: ['analytics', 'economy'],
    queryFn: () => api.get('/analytics/economy').then((r) => r.data),
  });

  const churn = useQuery<ChurnPlayer[]>({
    queryKey: ['analytics', 'churn-risk'],
    queryFn: () => api.get('/analytics/churn-risk').then((r) => r.data),
  });

  const heatmap = useQuery<HeatmapData>({
    queryKey: ['analytics', 'heatmap'],
    queryFn: () => api.get('/analytics/heatmap').then((r) => r.data),
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>

      {/* Retention metrics */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Player Activity</h2>
        {retention.isLoading ? (
          <p className="text-gray-400">Loading…</p>
        ) : retention.isError ? (
          <p className="text-red-500 text-sm">Failed to load player activity.</p>
        ) : retention.data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Daily Active" value={retention.data.dau} sub="last 24h" />
            <StatCard label="Weekly Active" value={retention.data.wau} sub="last 7 days" />
            <StatCard label="Monthly Active" value={retention.data.mau} sub="last 30 days" />
            <StatCard label="Total Players" value={retention.data.total} />
          </div>
        ) : null}
      </section>

      {/* New-player funnel */}
      {retention.data && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            New-Player Funnel <span className="text-sm font-normal text-gray-400">(last 30 days)</span>
          </h2>
          <div className="bg-white rounded-lg shadow p-6 space-y-4 max-w-xl">
            <FunnelBar
              label="Joined"
              count={retention.data.funnel.joined}
              max={retention.data.funnel.joined}
            />
            <FunnelBar
              label="Started a challenge"
              count={retention.data.funnel.firstChallenge}
              max={retention.data.funnel.joined}
            />
            <FunnelBar
              label="Earned a reward"
              count={retention.data.funnel.firstReward}
              max={retention.data.funnel.joined}
            />
          </div>
        </section>
      )}

      {/* Engagement heatmap */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Engagement Heatmap</h2>
        {heatmap.isLoading ? (
          <p className="text-gray-400">Loading…</p>
        ) : heatmap.isError ? (
          <p className="text-red-500 text-sm">Failed to load heatmap data.</p>
        ) : heatmap.data ? (
          <Heatmap data={heatmap.data} />
        ) : null}
      </section>

      {/* Challenge performance */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Challenge Performance</h2>
        {challenges.isLoading ? (
          <p className="text-gray-400">Loading…</p>
        ) : challenges.data && challenges.data.length > 0 ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Challenge</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Attempts</th>
                  <th className="px-4 py-3 text-right">Completions</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-center">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {challenges.data.map((ch) => (
                  <tr key={ch.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{ch.title}</td>
                    <td className="px-4 py-3 text-gray-500">{ch.type.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{ch.attempts}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{ch.completions}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${ch.completionRate}%` }}
                          />
                        </div>
                        <span className="text-gray-700 w-9 text-right">{ch.completionRate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {ch.flag ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${FLAG_BADGE[ch.flag]}`}>
                          {ch.flag.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400">No challenge data yet.</p>
        )}
      </section>

      {/* Economy */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Economy</h2>
        {economy.isLoading ? (
          <p className="text-gray-400">Loading…</p>
        ) : economy.isError ? (
          <p className="text-red-500 text-sm">Failed to load economy data.</p>
        ) : economy.data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-5">
              <h3 className="font-medium text-gray-700 mb-3">Top Reward Recipients</h3>
              {economy.data.topRecipients.length === 0 ? (
                <p className="text-gray-400 text-sm">No data yet.</p>
              ) : (
                <ol className="space-y-2">
                  {economy.data.topRecipients.map((r, i) => (
                    <li key={r.playerId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-5 text-gray-400 text-xs">{i + 1}.</span>
                        <span className="font-medium text-gray-800">{r.username}</span>
                      </span>
                      <span className="text-indigo-600 font-semibold">{r.grantCount} rewards</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="bg-white rounded-lg shadow p-5">
              <h3 className="font-medium text-gray-700 mb-3">Most Popular Rewards</h3>
              {economy.data.popularRewards.length === 0 ? (
                <p className="text-gray-400 text-sm">No data yet.</p>
              ) : (
                <ol className="space-y-2">
                  {economy.data.popularRewards.map((r, i) => (
                    <li key={r.rewardId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-5 text-gray-400 text-xs">{i + 1}.</span>
                        <span className="font-medium text-gray-800">{r.name}</span>
                      </span>
                      <span className="text-green-600 font-semibold">{r.grantCount}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* Churn risk */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Churn Risk
          <span className="ml-2 text-sm font-normal text-gray-400">
            active 2–4 weeks ago, not seen since
          </span>
        </h2>
        {churn.isLoading ? (
          <p className="text-gray-400">Loading…</p>
        ) : churn.data && churn.data.length > 0 ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-right">Total Joins</th>
                  <th className="px-4 py-3 text-right">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {churn.data.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.username}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.joinCount}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {daysAgo(p.lastSeenAt)}d ago
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400">No at-risk players detected.</p>
        )}
      </section>
    </div>
  );
}
