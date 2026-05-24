import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface Deployment {
  id: string;
  imageTag: string;
  triggeredBy: string;
  action: 'deploy' | 'restart' | 'start' | 'stop';
  notes?: string | null;
  createdAt: string;
}

interface DeploymentsResponse {
  data: Deployment[];
  meta: { total: number; page: number; limit: number; pages: number };
}

const ACTION_STYLES: Record<string, { label: string; cls: string; dot: string }> = {
  deploy:  { label: 'Deploy',   cls: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'  },
  restart: { label: 'Restart',  cls: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  start:   { label: 'Start',    cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500'  },
  stop:    { label: 'Stop',     cls: 'bg-red-100 text-red-600',      dot: 'bg-red-500'    },
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_STYLES[action] ?? { label: action, cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function formatDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

export function UpdateHistory() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<DeploymentsResponse>({
    queryKey: ['deployments', page],
    queryFn: () => api.get(`/deployments?page=${page}&limit=30`).then((r) => r.data),
    staleTime: 30_000,
  });

  const deployments = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Update History</h1>
          <p className="text-sm text-gray-500 mt-1">
            Deployments and server power actions
          </p>
        </div>
        {meta && (
          <span className="text-sm text-gray-500">{meta.total} total events</span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          Loading…
        </div>
      )}

      {!isLoading && deployments.length === 0 && (
        <div className="bg-white rounded-lg shadow p-10 text-center text-gray-400">
          No deployments recorded yet. They will appear here after the next deploy or server action.
        </div>
      )}

      {!isLoading && deployments.length > 0 && (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[140px] top-0 bottom-0 w-px bg-gray-200" />

          <div className="space-y-0">
            {deployments.map((d, idx) => {
              const { date, time } = formatDate(d.createdAt);
              const prevDate = idx > 0 ? formatDate(deployments[idx - 1].createdAt).date : null;
              const showDateLabel = date !== prevDate;

              return (
                <div key={d.id}>
                  {showDateLabel && (
                    <div className="flex items-center gap-4 py-3">
                      <div className="w-[132px] text-right">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{date}</span>
                      </div>
                      <div className="w-px bg-gray-200 self-stretch" />
                    </div>
                  )}

                  <div className="flex items-start gap-4 py-3 group">
                    {/* Time column */}
                    <div className="w-[132px] text-right flex-shrink-0 pt-0.5">
                      <span className="text-xs text-gray-400 font-mono">{time}</span>
                    </div>

                    {/* Timeline dot */}
                    <div className="relative flex-shrink-0 w-px">
                      <div className={`absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${ACTION_STYLES[d.action]?.dot ?? 'bg-gray-400'} shadow-sm`} />
                    </div>

                    {/* Content card */}
                    <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 px-4 py-3 ml-3 group-hover:border-gray-200 transition-colors">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <ActionBadge action={d.action} />
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {d.imageTag}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                        <span>
                          <span className="text-gray-400 mr-1">by</span>
                          <span className="font-medium">{d.triggeredBy}</span>
                        </span>
                        {d.notes && (
                          <span className="text-gray-400 text-xs truncate max-w-xs" title={d.notes}>
                            {d.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Older
          </button>
          <span className="text-sm text-gray-500">
            Page {meta.page} of {meta.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
            disabled={page === meta.pages}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Newer →
          </button>
        </div>
      )}
    </div>
  );
}
