import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

const ACTION_BADGE: Record<string, string> = {
  MUTE: 'bg-orange-100 text-orange-700',
  UNMUTE: 'bg-green-100 text-green-700',
  KICK: 'bg-yellow-100 text-yellow-700',
  BAN: 'bg-red-100 text-red-700',
  UNBAN: 'bg-green-100 text-green-700',
};

export function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<'challenges' | 'rewards' | 'moderation'>('challenges');

  // Grant reward modal state
  const [showGrant, setShowGrant] = useState(false);
  const [grantRewardId, setGrantRewardId] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [grantResult, setGrantResult] = useState<{ queued: boolean } | null>(null);
  const [grantError, setGrantError] = useState('');

  // Apply action modal state
  const [showAction, setShowAction] = useState(false);
  const [actionType, setActionType] = useState<'MUTE' | 'KICK' | 'BAN'>('MUTE');
  const [actionReason, setActionReason] = useState('');
  const [actionExpiry, setActionExpiry] = useState('');
  const [actionError, setActionError] = useState('');

  const { data: player, isLoading, isError } = useQuery({
    queryKey: ['player', id],
    queryFn: () => api.get(`/players/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: rewardsData } = useQuery({
    queryKey: ['rewards-list-all'],
    queryFn: () => api.get('/rewards', { params: { limit: 100 } }).then((r) => r.data.data),
    enabled: showGrant,
  });

  const { data: auditData } = useQuery({
    queryKey: ['player-audit', id],
    queryFn: () => api.get('/moderation/audit-log', { params: { targetId: id, limit: 50 } }).then((r) => r.data),
    enabled: tab === 'moderation',
  });

  const grantMutation = useMutation({
    mutationFn: (body: object) => api.post('/rewards/grant', body).then((r) => r.data),
    onSuccess: (data) => {
      setGrantResult(data);
      setGrantRewardId('');
      setGrantReason('');
      qc.invalidateQueries({ queryKey: ['player', id] });
    },
    onError: (err: any) => {
      setGrantError(err?.response?.data?.message ?? 'Grant failed');
    },
  });

  const actionMutation = useMutation({
    mutationFn: (body: object) => api.post('/moderation/actions/admin', body).then((r) => r.data),
    onSuccess: () => {
      setShowAction(false);
      setActionReason('');
      setActionExpiry('');
      setActionError('');
      qc.invalidateQueries({ queryKey: ['player-audit', id] });
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message ?? 'Action failed');
    },
  });

  function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setGrantError('');
    setGrantResult(null);
    if (!grantRewardId) { setGrantError('Select a reward'); return; }
    grantMutation.mutate({ playerId: id, rewardId: grantRewardId, reason: grantReason || undefined });
  }

  function handleAction(e: React.FormEvent) {
    e.preventDefault();
    setActionError('');
    actionMutation.mutate({
      targetId: id,
      type: actionType,
      reason: actionReason,
      expiresAt: actionExpiry ? new Date(actionExpiry).toISOString() : undefined,
    });
  }

  if (isLoading) return <div className="text-gray-400 p-8">Loading…</div>;
  if (isError || !player) {
    return (
      <div className="p-8">
        <button onClick={() => navigate('/players')} className="text-sm text-blue-600 hover:underline mb-4 block">
          ← Back to players
        </button>
        <p className="text-red-500">Player not found or could not be loaded.</p>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/players')} className="text-sm text-blue-600 hover:underline mb-4">
        ← Back to players
      </button>
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{player.username}</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => { setShowAction(true); setActionError(''); }}
                className="text-sm px-3 py-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50"
              >
                Apply Action
              </button>
            )}
            <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
              {player.tier}
            </span>
          </div>
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
        <div className="border-b flex items-center justify-between pr-4">
          <div className="flex">
            {(['challenges', 'rewards', 'moderation'] as const).map((t) => (
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
          {tab === 'rewards' && isAdmin && (
            <button
              onClick={() => { setShowGrant(true); setGrantResult(null); setGrantError(''); }}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Grant Reward
            </button>
          )}
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
          {tab === 'moderation' && (
            <table className="w-full text-sm">
              <thead className="text-gray-500 uppercase text-xs">
                <tr>
                  <th className="text-left py-2">Action</th>
                  <th className="text-left py-2">Reason</th>
                  <th className="text-left py-2">Admin</th>
                  <th className="text-left py-2">Created</th>
                  <th className="text-left py-2">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditData?.data?.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-gray-400">No moderation history</td></tr>
                )}
                {auditData?.data?.map((a: any) => (
                  <tr key={a.id}>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_BADGE[a.type] ?? ''}`}>
                        {a.type}
                      </span>
                    </td>
                    <td className="py-2 text-gray-700">{a.reason}</td>
                    <td className="py-2 text-gray-500">{a.adminId}</td>
                    <td className="py-2 text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 text-gray-500">
                      {a.expiresAt ? new Date(a.expiresAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Grant Reward Modal */}
      {showGrant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form
            onSubmit={handleGrant}
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-800">Grant Reward</h2>

            {grantResult ? (
              <div className={`rounded p-3 text-sm ${grantResult.queued ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'}`}>
                {grantResult.queued
                  ? 'Reward queued — player is offline. Will be delivered on next login.'
                  : 'Reward delivered successfully!'}
              </div>
            ) : (
              <>
                {grantError && <p className="text-red-600 text-sm">{grantError}</p>}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reward template</label>
                  <select
                    value={grantRewardId}
                    onChange={(e) => setGrantRewardId(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a reward…</option>
                    {rewardsData?.map((r: any) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
                  <input
                    value={grantReason}
                    onChange={(e) => setGrantReason(e.target.value)}
                    placeholder="e.g. event prize"
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowGrant(false); setGrantResult(null); }}
                className="px-4 py-1.5 text-sm border rounded hover:bg-gray-50"
              >
                {grantResult ? 'Close' : 'Cancel'}
              </button>
              {!grantResult && (
                <button
                  type="submit"
                  disabled={grantMutation.isPending}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {grantMutation.isPending ? 'Granting…' : 'Grant'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Apply Action Modal */}
      {showAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form
            onSubmit={handleAction}
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-800">Apply Moderation Action</h2>
            {actionError && <p className="text-red-600 text-sm">{actionError}</p>}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Action type</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as any)}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="MUTE">Mute</option>
                <option value="KICK">Kick</option>
                <option value="BAN">Ban</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
              <input
                required
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {(actionType === 'MUTE' || actionType === 'BAN') && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expires at (optional)</label>
                <input
                  type="datetime-local"
                  value={actionExpiry}
                  onChange={(e) => setActionExpiry(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowAction(false); setActionError(''); }}
                className="px-4 py-1.5 text-sm border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionMutation.isPending}
                className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {actionMutation.isPending ? 'Applying…' : 'Apply'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
