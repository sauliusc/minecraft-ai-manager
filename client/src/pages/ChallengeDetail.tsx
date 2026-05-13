import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface Challenge {
  id: string;
  title: string;
  description: string;
  type: string;
  config: Record<string, unknown>;
  rewardId: string | null;
  activeFrom: string;
  activeUntil: string;
  assignedTo: string[];
  progress: { total: number; completed: number };
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ChallengeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    config: string;
    activeFrom: string;
    activeUntil: string;
    assignedTo: string;
  } | null>(null);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: challenge, isLoading, isError } = useQuery<Challenge>({
    queryKey: ['challenges', id],
    queryFn: () => api.get(`/challenges/${id}`).then((r) => r.data),
  });

  const update = useMutation({
    mutationFn: (body: object) => api.patch(`/challenges/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges'] });
      setEditing(false);
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Update failed');
    },
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/challenges/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges'] });
      navigate('/challenges');
    },
  });

  function startEditing() {
    if (!challenge) return;
    setForm({
      title: challenge.title,
      description: challenge.description,
      config: JSON.stringify(challenge.config, null, 2),
      activeFrom: toLocalDatetime(challenge.activeFrom),
      activeUntil: toLocalDatetime(challenge.activeUntil),
      assignedTo: challenge.assignedTo.join(', '),
    });
    setEditing(true);
    setFormError('');
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(form.config);
    } catch {
      setFormError('Config must be valid JSON');
      return;
    }
    update.mutate({
      title: form.title,
      description: form.description,
      config,
      activeFrom: new Date(form.activeFrom).toISOString(),
      activeUntil: new Date(form.activeUntil).toISOString(),
      assignedTo: form.assignedTo ? form.assignedTo.split(',').map((s) => s.trim()) : [],
    });
  }

  if (isLoading) return <div className="text-gray-400 p-6">Loading…</div>;
  if (isError || !challenge) return <div className="text-red-500 p-6">Challenge not found.</div>;

  const now = Date.now();
  const activeFrom = new Date(challenge.activeFrom).getTime();
  const activeUntil = new Date(challenge.activeUntil).getTime();
  const statusLabel = now < activeFrom ? 'Upcoming' : now > activeUntil ? 'Expired' : 'Active';
  const statusCls = now < activeFrom
    ? 'bg-yellow-100 text-yellow-700'
    : now > activeUntil
    ? 'bg-gray-100 text-gray-500'
    : 'bg-emerald-100 text-emerald-700';

  const completionPct = challenge.progress.total > 0
    ? Math.round((challenge.progress.completed / challenge.progress.total) * 100)
    : 0;

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/challenges')}
        className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1"
      >
        ← Back to Challenges
      </button>

      {!editing ? (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{challenge.title}</h1>
              <p className="text-gray-500 mt-1">{challenge.description}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusCls}`}>
              {statusLabel}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase">Type</p>
              <p className="text-gray-800 mt-0.5">{challenge.type.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase">Active Period</p>
              <p className="text-gray-800 mt-0.5">
                {new Date(challenge.activeFrom).toLocaleDateString()} – {new Date(challenge.activeUntil).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase">Assigned To</p>
              <p className="text-gray-800 mt-0.5">
                {challenge.assignedTo.length > 0 ? `${challenge.assignedTo.length} player(s)` : 'All players'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-gray-500 text-xs font-medium uppercase mb-1">Config</p>
            <pre className="bg-gray-50 rounded p-3 text-xs text-gray-700 overflow-auto">
              {JSON.stringify(challenge.config, null, 2)}
            </pre>
          </div>

          <div>
            <p className="text-gray-500 text-xs font-medium uppercase mb-2">Progress</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <span className="text-sm text-gray-600">
                {challenge.progress.completed} / {challenge.progress.total} players
              </span>
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-2 pt-2 border-t">
              <button
                onClick={startEditing}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Edit
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
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleUpdate} className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Edit Challenge</h2>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input
              required
              value={form!.title}
              onChange={(e) => setForm({ ...form!, title: e.target.value })}
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              required
              rows={2}
              value={form!.description}
              onChange={(e) => setForm({ ...form!, description: e.target.value })}
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Active From</label>
              <input
                required
                type="datetime-local"
                value={form!.activeFrom}
                onChange={(e) => setForm({ ...form!, activeFrom: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Active Until</label>
              <input
                required
                type="datetime-local"
                value={form!.activeUntil}
                onChange={(e) => setForm({ ...form!, activeUntil: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To (UUIDs, comma-sep)</label>
            <input
              value={form!.assignedTo}
              onChange={(e) => setForm({ ...form!, assignedTo: e.target.value })}
              placeholder="leave empty for all players"
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
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
