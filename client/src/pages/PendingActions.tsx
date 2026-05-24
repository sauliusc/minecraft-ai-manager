import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface PendingAction {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  resource: string;
  method: string;
  path: string;
  body: unknown;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  executedAt: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
}

const METHOD_COLORS: Record<string, string> = {
  POST: 'bg-green-100 text-green-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export function PendingActions() {
  const user = useAuthStore(s => s.user);
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['pending-actions', page],
    queryFn: () => api.get(`/pending-actions?page=${page}&limit=50`).then(r => r.data),
    enabled: user?.autoConfirm === true,
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.post(`/pending-actions/${id}/confirm`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-actions'] }),
    onError: (err: any) => alert(err.response?.data?.message ?? 'Failed to confirm'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/pending-actions/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-actions'] }),
    onError: (err: any) => alert(err.response?.data?.message ?? 'Failed to reject'),
  });

  if (!user?.autoConfirm) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>You don't have permission to view pending actions.</p>
        <p className="text-sm mt-1">Only users with autoConfirm=true can access this page.</p>
      </div>
    );
  }

  const actions: PendingAction[] = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Pending Actions</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted By</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted At</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Method</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Resource</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actions.map((action) => (
                <>
                  <tr
                    key={action.id}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-gray-700">{action.userEmail}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(action.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${METHOD_COLORS[action.method] ?? 'bg-gray-100 text-gray-600'}`}>
                        {action.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{action.resource}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <button
                        onClick={() => setExpandedId(expandedId === action.id ? null : action.id)}
                        className="text-left hover:underline"
                      >
                        {action.action}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[action.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {action.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {action.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => confirmMutation.mutate(action.id)}
                            disabled={confirmMutation.isPending}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate(action.id)}
                            disabled={rejectMutation.isPending}
                            className="px-3 py-1 text-xs border border-red-500 text-red-500 rounded hover:bg-red-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expandedId === action.id && (
                    <tr key={`${action.id}-body`} className="bg-gray-50">
                      <td colSpan={7} className="px-4 py-3">
                        <p className="text-xs font-medium text-gray-500 mb-1">Request Body:</p>
                        <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap">
                          {JSON.stringify(action.body, null, 2)}
                        </pre>
                        {action.result && (
                          <>
                            <p className="text-xs font-medium text-gray-500 mt-2 mb-1">Execution Result:</p>
                            <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap">
                              {JSON.stringify(action.result, null, 2)}
                            </pre>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {actions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No pending actions</td>
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
