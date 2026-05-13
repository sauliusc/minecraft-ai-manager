import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface Reward {
  id: string;
  name: string;
  type: string;
  rarity: string | null;
  config: Record<string, unknown>;
  grantCount: number;
}

const RARITY_BORDER: Record<string, string> = {
  COMMON: 'border-gray-300',
  RARE: 'border-blue-400',
  EPIC: 'border-purple-500',
  LEGENDARY: 'border-yellow-500',
};

export function RewardDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ name: string; config: string; rarity: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [grantPlayerId, setGrantPlayerId] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [grantMsg, setGrantMsg] = useState('');
  const [showGrantForm, setShowGrantForm] = useState(false);

  const { data: reward, isLoading, isError } = useQuery<Reward>({
    queryKey: ['rewards', id],
    queryFn: () => api.get(`/rewards/${id}`).then((r) => r.data),
  });

  const update = useMutation({
    mutationFn: (body: object) => api.patch(`/rewards/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rewards'] });
      setEditing(false);
      setFormError('');
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'Update failed'),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/rewards/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rewards'] });
      navigate('/rewards');
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'Delete failed'),
  });

  const grant = useMutation({
    mutationFn: (body: object) => api.post('/rewards/grant', body).then((r) => r.data),
    onSuccess: (data) => {
      setGrantMsg(data.queued ? 'Reward queued (player offline).' : 'Reward delivered!');
      setGrantPlayerId('');
      setGrantReason('');
    },
    onError: (err: any) => setGrantMsg(err?.response?.data?.message ?? 'Grant failed'),
  });

  function startEditing() {
    if (!reward) return;
    setForm({ name: reward.name, config: JSON.stringify(reward.config, null, 2), rarity: reward.rarity ?? 'COMMON' });
    setEditing(true);
    setFormError('');
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    let config: Record<string, unknown>;
    try { config = JSON.parse(form.config); } catch { setFormError('Config must be valid JSON'); return; }
    update.mutate({ name: form.name, config, rarity: form.rarity });
  }

  function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setGrantMsg('');
    grant.mutate({ playerId: grantPlayerId.trim(), rewardId: id!, reason: grantReason || undefined });
  }

  if (isLoading) return <div className="text-gray-400 p-6">Loading…</div>;
  if (isError || !reward) return <div className="text-red-500 p-6">Reward not found.</div>;

  const rarityBorder = RARITY_BORDER[reward.rarity ?? 'COMMON'] ?? 'border-gray-300';

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/rewards')}
        className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1"
      >
        ← Back to Rewards
      </button>

      {!editing ? (
        <div className={`bg-white rounded-lg shadow border-l-4 ${rarityBorder} p-6 space-y-4`}>
          <div className="flex items-start justify-between">
            <h1 className="text-2xl font-bold text-gray-800">{reward.name}</h1>
            <div className="flex gap-2">
              <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{reward.type}</span>
              {reward.rarity && (
                <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700">{reward.rarity}</span>
              )}
            </div>
          </div>

          <div className="text-sm text-gray-500">{reward.grantCount} total grants</div>

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Config</p>
            <pre className="bg-gray-50 rounded p-3 text-xs text-gray-700 overflow-auto">
              {JSON.stringify(reward.config, null, 2)}
            </pre>
          </div>

          {isAdmin && (
            <div className="flex gap-2 pt-2 border-t flex-wrap">
              <button
                onClick={startEditing}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Edit
              </button>
              <button
                onClick={() => { setShowGrantForm(!showGrantForm); setGrantMsg(''); }}
                className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                Grant to Player
              </button>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-4 py-1.5 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
                >
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Are you sure?</span>
                  <button
                    onClick={() => del.mutate()}
                    disabled={del.isPending}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {del.isPending ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {formError && <p className="text-red-600 text-sm">{formError}</p>}

          {showGrantForm && (
            <form onSubmit={handleGrant} className="border rounded p-4 space-y-3 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Manual Grant</h3>
              {grantMsg && (
                <p className={`text-sm ${grantMsg.includes('failed') || grantMsg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                  {grantMsg}
                </p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Player UUID</label>
                <input
                  required
                  value={grantPlayerId}
                  onChange={(e) => setGrantPlayerId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
                <input
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={grant.isPending}
                className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {grant.isPending ? 'Granting…' : 'Grant Reward'}
              </button>
            </form>
          )}
        </div>
      ) : (
        <form onSubmit={handleUpdate} className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Edit Reward</h2>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              required
              value={form!.name}
              onChange={(e) => setForm({ ...form!, name: e.target.value })}
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rarity</label>
            <select
              value={form!.rarity}
              onChange={(e) => setForm({ ...form!, rarity: e.target.value })}
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['COMMON', 'RARE', 'EPIC', 'LEGENDARY'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Config (JSON)</label>
            <textarea
              required
              rows={5}
              value={form!.config}
              onChange={(e) => setForm({ ...form!, config: e.target.value })}
              className="w-full border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={update.isPending}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {update.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setFormError(''); }}
              className="px-4 py-1.5 text-sm border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
