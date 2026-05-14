import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface ModerationReport {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  chatSnapshot: string[];
  status: 'PENDING' | 'REVIEWED' | 'ESCALATED' | 'RESOLVED';
  escalated: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

interface AuditAction {
  id: string;
  targetId: string;
  adminId: string;
  type: 'MUTE' | 'UNMUTE' | 'KICK' | 'BAN' | 'UNBAN';
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

interface ChatEntry {
  id: string;
  playerId: string;
  username: string;
  message: string;
  flagged: boolean;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  REVIEWED: 'bg-blue-100 text-blue-700',
  ESCALATED: 'bg-red-100 text-red-700',
  RESOLVED: 'bg-gray-100 text-gray-500',
};

const ACTION_BADGE: Record<string, string> = {
  MUTE: 'bg-orange-100 text-orange-700',
  UNMUTE: 'bg-green-100 text-green-700',
  KICK: 'bg-yellow-100 text-yellow-700',
  BAN: 'bg-red-100 text-red-700',
  UNBAN: 'bg-green-100 text-green-700',
};

export function Moderation() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'reports' | 'chat' | 'audit'>('reports');
  const [selectedReport, setSelectedReport] = useState<ModerationReport | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const [reportPage] = useState(1);
  const [chatPage, setChatPage] = useState(1);
  const [auditPage] = useState(1);

  const { data: reportsData } = useQuery({
    queryKey: ['moderation-reports', reportPage],
    queryFn: () => api.get('/moderation/reports', { params: { page: reportPage, limit: 20 } }).then((r) => r.data),
    placeholderData: (p) => p,
  });

  const { data: chatData } = useQuery({
    queryKey: ['moderation-chat', chatPage, chatSearch],
    queryFn: () => api.get('/moderation/chat-log', { params: { page: chatPage, limit: 50, search: chatSearch || undefined } }).then((r) => r.data),
    placeholderData: (p) => p,
    enabled: tab === 'chat',
  });

  const { data: auditData } = useQuery({
    queryKey: ['moderation-audit', auditPage],
    queryFn: () => api.get('/moderation/audit-log', { params: { page: auditPage, limit: 50 } }).then((r) => r.data),
    placeholderData: (p) => p,
    enabled: tab === 'audit',
  });

  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/moderation/reports/${id}`, { status }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['moderation-reports'] }); setSelectedReport(null); },
  });

  const applyAction = useMutation({
    mutationFn: (body: object) => api.post('/moderation/actions/admin', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moderation-audit'] }),
  });

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Moderation</h1>

      <div className="flex gap-2 mb-4 border-b">
        {(['reports', 'chat', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize -mb-px ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'audit' ? 'Audit Log' : t === 'chat' ? 'Chat Log' : 'Reports'}
          </button>
        ))}
      </div>

      {tab === 'reports' && (
        <div className="space-y-3">
          {selectedReport ? (
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Report Detail</h2>
                <button onClick={() => setSelectedReport(null)} className="text-sm text-blue-600 hover:underline">← Back</button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium">Reporter:</span> {selectedReport.reporterId}</div>
                <div><span className="font-medium">Reported:</span> {selectedReport.reportedId}</div>
                <div><span className="font-medium">Reason:</span> {selectedReport.reason}</div>
                <div><span className="font-medium">Date:</span> {formatDate(selectedReport.createdAt)}</div>
              </div>
              {selectedReport.chatSnapshot.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Chat Snapshot</p>
                  <div className="bg-gray-900 rounded p-3 max-h-64 overflow-auto">
                    {selectedReport.chatSnapshot.map((line, i) => (
                      <p key={i} className="text-xs text-gray-300 font-mono">{line}</p>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => resolve.mutate({ id: selectedReport.id, status: 'REVIEWED' })}
                  disabled={resolve.isPending || applyAction.isPending}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Mark Reviewed</button>
                <button onClick={() => resolve.mutate({ id: selectedReport.id, status: 'RESOLVED' })}
                  disabled={resolve.isPending || applyAction.isPending}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">Resolve</button>
                {user?.role === 'SUPER_ADMIN' && (
                  <>
                    <button onClick={() => applyAction.mutate({ targetId: selectedReport.reportedId, type: 'MUTE', reason: selectedReport.reason, expiresAt: new Date(Date.now() + 3600000).toISOString() })}
                      disabled={resolve.isPending || applyAction.isPending}
                      className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed">Mute 1h</button>
                    <button onClick={() => applyAction.mutate({ targetId: selectedReport.reportedId, type: 'KICK', reason: selectedReport.reason })}
                      disabled={resolve.isPending || applyAction.isPending}
                      className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed">Kick</button>
                    <button onClick={() => applyAction.mutate({ targetId: selectedReport.reportedId, type: 'BAN', reason: selectedReport.reason })}
                      disabled={resolve.isPending || applyAction.isPending}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">Ban</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Reported</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportsData?.data?.map((r: ModerationReport) => (
                    <tr key={r.id} className={r.escalated ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[r.status]}`}>
                          {r.status}
                        </span>
                        {r.escalated && <span className="ml-1 text-xs text-red-600 font-bold">!</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.reportedId.slice(0, 8)}…</td>
                      <td className="px-4 py-3 max-w-xs truncate">{r.reason}</td>
                      <td className="px-4 py-3 text-gray-400">{formatDate(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedReport(r)} className="text-xs text-blue-600 hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'chat' && (
        <div className="space-y-3">
          <input
            value={chatSearch}
            onChange={(e) => { setChatSearch(e.target.value); setChatPage(1); }}
            placeholder="Search messages…"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-left">Message</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {chatData?.data?.map((c: ChatEntry) => (
                  <tr key={c.id} className={c.flagged ? 'bg-yellow-50' : ''}>
                    <td className="px-4 py-2 font-medium">{c.username}</td>
                    <td className="px-4 py-2 max-w-md truncate">{c.message}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Target</th>
                <th className="px-4 py-3 text-left">Admin</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {auditData?.data?.map((a: AuditAction) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${ACTION_BADGE[a.type]}`}>{a.type}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.targetId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.adminId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 max-w-xs truncate">{a.reason}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
