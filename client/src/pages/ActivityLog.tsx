import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface ActivityLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  resource: string;
  resourceId: string | null;
  method: string;
  path: string;
  requestBody: unknown | null;
  ipAddress: string;
  status: string;
  pendingActionId: string | null;
  createdAt: string;
}

const METHOD_COLORS: Record<string, string> = {
  POST: 'bg-green-100 text-green-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  GET: 'bg-gray-100 text-gray-600',
};

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  FAILED: 'bg-red-100 text-red-700',
};

export function ActivityLog() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    userId: '',
    resource: '',
    method: '',
    status: '',
    from: '',
    to: '',
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.resource) params.set('resource', filters.resource);
  if (filters.method) params.set('method', filters.method);
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const { data, isLoading } = useQuery({
    queryKey: ['activity-log', page, filters],
    queryFn: () => api.get(`/activity-log?${params.toString()}`).then(r => r.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users?limit=100').then(r => r.data),
  });

  const entries: ActivityLogEntry[] = data?.data ?? [];
  const meta = data?.meta;
  const users = usersData?.data ?? [];

  const updateFilter = (key: string, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Activity Log</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
          <select
            value={filters.userId}
            onChange={e => updateFilter('userId', e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All users</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Resource</label>
          <input
            type="text"
            value={filters.resource}
            onChange={e => updateFilter('resource', e.target.value)}
            placeholder="e.g. challenge"
            className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Method</label>
          <select
            value={filters.method}
            onChange={e => updateFilter('method', e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="POST">POST</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={filters.status}
            onChange={e => updateFilter('status', e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="PENDING">PENDING</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={filters.from}
            onChange={e => updateFilter('from', e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={filters.to}
            onChange={e => updateFilter('to', e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Method</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Resource</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{entry.userEmail}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${METHOD_COLORS[entry.method] ?? 'bg-gray-100 text-gray-600'}`}>
                        {entry.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{entry.resource}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.action}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[entry.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                  {expandedId === entry.id && entry.requestBody && (
                    <tr key={`${entry.id}-body`} className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-3">
                        <p className="text-xs font-medium text-gray-500 mb-1">Request Body:</p>
                        <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap">
                          {JSON.stringify(entry.requestBody, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No activity logs found</td>
                </tr>
              )}
            </tbody>
          </table>
          {meta && meta.pages > 1 && (
            <div className="px-4 py-3 border-t flex items-center gap-2 text-sm text-gray-600">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded border disabled:opacity-50">Prev</button>
              <span>Page {page} of {meta.pages}</span>
              <button disabled={page >= meta.pages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded border disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
