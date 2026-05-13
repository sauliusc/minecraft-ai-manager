import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface Reward {
  id: string;
  name: string;
  type: string;
  rarity: string | null;
  config: Record<string, unknown>;
  grantCount?: number;
}

const RARITY_COLORS: Record<string, string> = {
  COMMON: 'border-gray-300 bg-gray-50',
  RARE: 'border-blue-400 bg-blue-50',
  EPIC: 'border-purple-500 bg-purple-50',
  LEGENDARY: 'border-yellow-500 bg-yellow-50',
};

const RARITY_BADGE: Record<string, string> = {
  COMMON: 'bg-gray-100 text-gray-600',
  RARE: 'bg-blue-100 text-blue-700',
  EPIC: 'bg-purple-100 text-purple-700',
  LEGENDARY: 'bg-yellow-100 text-yellow-700',
};

const TYPE_BADGE: Record<string, string> = {
  ITEM: 'bg-green-100 text-green-700',
  XP: 'bg-cyan-100 text-cyan-700',
  COMMAND: 'bg-orange-100 text-orange-700',
  CURRENCY: 'bg-yellow-100 text-yellow-700',
};

const emptyForm = {
  name: '',
  type: 'ITEM',
  rarity: 'COMMON',
  config: '{}',
};

export function Rewards() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['rewards', page, typeFilter],
    queryFn: () =>
      api
        .get('/rewards', { params: { page, limit: 20, type: typeFilter || undefined } })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const create = useMutation({
    mutationFn: (body: object) => api.post('/rewards', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rewards'] });
      setShowForm(false);
      setForm(emptyForm);
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to create reward');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(form.config);
    } catch {
      setFormError('Config must be valid JSON');
      return;
    }
    create.mutate({ name: form.name, type: form.type, rarity: form.rarity, config });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Rewards</h1>
        {isAdmin && (
          <button
            onClick={() => { setShowForm(true); setFormError(''); }}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700"
          >
            + New Reward
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-3"
          >
            <h2 className="text-lg font-semibold text-gray-800">New Reward Template</h2>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['ITEM', 'XP', 'COMMAND', 'CURRENCY'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rarity</label>
                <select
                  value={form.rarity}
                  onChange={(e) => setForm({ ...form, rarity: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['COMMON', 'RARE', 'EPIC', 'LEGENDARY'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Config (JSON)
                {form.type === 'ITEM' && <span className="text-gray-400 ml-1">e.g. {`{"material":"DIAMOND","amount":5}`}</span>}
                {form.type === 'XP' && <span className="text-gray-400 ml-1">e.g. {`{"amount":500}`}</span>}
                {form.type === 'COMMAND' && <span className="text-gray-400 ml-1">e.g. {`{"command":"give {player} diamond 1"}`}</span>}
              </label>
              <textarea
                required
                rows={3}
                value={form.config}
                onChange={(e) => setForm({ ...form, config: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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

      <div className="mb-4">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All types</option>
          {['ITEM', 'XP', 'COMMAND', 'CURRENCY'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-400 p-6">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.data?.map((r: Reward) => (
            <div
              key={r.id}
              onClick={() => navigate(`/rewards/${r.id}`)}
              className={`border-2 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${RARITY_COLORS[r.rarity ?? 'COMMON'] ?? 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-800 truncate">{r.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${RARITY_BADGE[r.rarity ?? 'COMMON'] ?? ''}`}>
                  {r.rarity ?? 'COMMON'}
                </span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_BADGE[r.type] ?? ''}`}>
                {r.type}
              </span>
              {r.grantCount !== undefined && (
                <p className="text-xs text-gray-400 mt-2">{r.grantCount} grants</p>
              )}
            </div>
          ))}
        </div>
      )}

      {data?.meta && data.meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>{data.meta.total} rewards</span>
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
  );
}
