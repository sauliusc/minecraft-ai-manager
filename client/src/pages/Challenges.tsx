import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface Challenge {
  id: string;
  title: string;
  description: string;
  type: string;
  difficulty: number;
  config: Record<string, unknown>;
  activeFrom: string;
  activeUntil: string;
  assignedTo: string[];
}

const TYPE_COLORS: Record<string, string> = {
  BLOCK_BREAK: 'bg-orange-100 text-orange-700',
  KILL_MOB: 'bg-red-100 text-red-700',
  CRAFT_ITEM: 'bg-green-100 text-green-700',
  TRAVEL: 'bg-blue-100 text-blue-700',
  CUSTOM: 'bg-gray-100 text-gray-600',
};

function challengeStatus(c: Challenge): { label: string; cls: string } {
  const now = Date.now();
  const from = new Date(c.activeFrom).getTime();
  const until = new Date(c.activeUntil).getTime();
  if (now < from) return { label: 'Upcoming', cls: 'bg-yellow-100 text-yellow-700' };
  if (now > until) return { label: 'Expired', cls: 'bg-gray-100 text-gray-500' };
  return { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' };
}

const emptyForm = {
  title: '',
  description: '',
  type: 'BLOCK_BREAK',
  difficulty: '1',
  targetMaterial: '',
  targetEntity: '',
  targetCount: '1',
  customConfig: '{}',
  activeFrom: '',
  activeUntil: '',
  assignedTo: '',
};

function buildConfig(type: string, form: typeof emptyForm): Record<string, unknown> {
  if (type === 'BLOCK_BREAK' || type === 'CRAFT_ITEM') {
    return { target_material: form.targetMaterial.toUpperCase(), target_count: Number(form.targetCount) };
  }
  if (type === 'KILL_MOB') {
    return { target_entity: form.targetEntity.toUpperCase(), target_count: Number(form.targetCount) };
  }
  if (type === 'TRAVEL') {
    return { target_count: Number(form.targetCount) };
  }
  return JSON.parse(form.customConfig || '{}');
}

export function Challenges() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['challenges', page, status, type, difficulty],
    queryFn: () =>
      api
        .get('/challenges', {
          params: {
            page,
            limit: 20,
            status: status || undefined,
            type: type || undefined,
            difficulty: difficulty || undefined,
          },
        })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const create = useMutation({
    mutationFn: (body: object) => api.post('/challenges', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges'] });
      setShowForm(false);
      setForm(emptyForm);
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to create challenge');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let config: Record<string, unknown>;
    try {
      config = buildConfig(form.type, form);
    } catch {
      setFormError('Custom config must be valid JSON');
      return;
    }
    create.mutate({
      title: form.title,
      description: form.description,
      type: form.type,
      difficulty: Number(form.difficulty),
      config,
      activeFrom: new Date(form.activeFrom).toISOString(),
      activeUntil: new Date(form.activeUntil).toISOString(),
      assignedTo: form.assignedTo ? form.assignedTo.split(',').map((s) => s.trim()) : [],
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Challenges</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/challenges/calendar"
            className="text-sm px-4 py-2 border rounded hover:bg-gray-50 text-gray-700"
          >
            Calendar
          </Link>
          {isAdmin && (
            <button
              onClick={() => { setShowForm(true); setFormError(''); }}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700"
            >
              + New Challenge
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-3"
          >
            <h2 className="text-lg font-semibold text-gray-800">New Challenge</h2>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                required
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['BLOCK_BREAK', 'KILL_MOB', 'CRAFT_ITEM', 'TRAVEL', 'CUSTOM'].map((t) => (
                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Difficulty (1–5)</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>{'★'.repeat(d) + '☆'.repeat(5 - d)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To (UUIDs, comma-sep)</label>
                <input
                  value={form.assignedTo}
                  onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                  placeholder="all players if empty"
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Type-specific config fields */}
            {(form.type === 'BLOCK_BREAK' || form.type === 'CRAFT_ITEM') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Material (e.g. OAK_LOG)</label>
                  <input
                    required
                    value={form.targetMaterial}
                    onChange={(e) => setForm({ ...form, targetMaterial: e.target.value })}
                    placeholder="OAK_LOG"
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Target count</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={form.targetCount}
                    onChange={(e) => setForm({ ...form, targetCount: e.target.value })}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
            {form.type === 'KILL_MOB' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Entity type (e.g. ZOMBIE)</label>
                  <input
                    required
                    value={form.targetEntity}
                    onChange={(e) => setForm({ ...form, targetEntity: e.target.value })}
                    placeholder="ZOMBIE"
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Target count</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={form.targetCount}
                    onChange={(e) => setForm({ ...form, targetCount: e.target.value })}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
            {form.type === 'TRAVEL' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Distance (blocks)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.targetCount}
                  onChange={(e) => setForm({ ...form, targetCount: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            {form.type === 'CUSTOM' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Config (JSON)</label>
                <textarea
                  required
                  rows={3}
                  value={form.customConfig}
                  onChange={(e) => setForm({ ...form, customConfig: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Active From</label>
                <input
                  required
                  type="datetime-local"
                  value={form.activeFrom}
                  onChange={(e) => setForm({ ...form, activeFrom: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Active Until</label>
                <input
                  required
                  type="datetime-local"
                  value={form.activeUntil}
                  onChange={(e) => setForm({ ...form, activeUntil: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(emptyForm); setFormError(''); }}
                className="px-4 py-1.5 text-sm border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {create.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b flex gap-3">
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="expired">Expired</option>
          </select>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All types</option>
            {['BLOCK_BREAK', 'KILL_MOB', 'CRAFT_ITEM', 'TRAVEL', 'CUSTOM'].map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(e) => { setDifficulty(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All difficulties</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>{'★'.repeat(d)}</option>
            ))}
          </select>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Title</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Difficulty</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Active From</th>
              <th className="px-4 py-3 text-left">Active Until</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No challenges found</td></tr>
            ) : data?.data?.map((c: Challenge) => {
              const st = challengeStatus(c);
              const diff = c.difficulty ?? 1;
              return (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/challenges/${c.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{c.title}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[c.type] ?? ''}`}>
                      {c.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-yellow-500 text-sm">{'★'.repeat(diff)}{'☆'.repeat(5 - diff)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(c.activeFrom).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(c.activeUntil).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {data?.meta && (
          <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
            <span>
              {data.meta.total === 0
                ? 'No results'
                : `Showing ${((page - 1) * 20) + 1}–${Math.min(page * 20, data.meta.total)} of ${data.meta.total}`}
            </span>
            <div className="space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.meta.pages, p + 1))}
                disabled={page >= data.meta.pages}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
