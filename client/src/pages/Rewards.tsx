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
  lootTable?: LootEntry[] | null;
  grantCount?: number;
}

interface LootEntry {
  rewardId: string;
  weight: number;
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
  MYSTERY_BOX: 'bg-pink-100 text-pink-700',
};

const ALL_TYPES = ['ITEM', 'XP', 'COMMAND', 'CURRENCY', 'MYSTERY_BOX'];

const emptyForm = {
  name: '',
  type: 'ITEM',
  rarity: 'COMMON',
  config: '{}',
};

function LootTableEditor({
  entries,
  onChange,
}: {
  entries: LootEntry[];
  onChange: (entries: LootEntry[]) => void;
}) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  const weightError = entries.length > 0 && total !== 100;

  function update(index: number, patch: Partial<LootEntry>) {
    const next = entries.map((e, i) => (i === index ? { ...e, ...patch } : e));
    onChange(next);
  }

  function remove(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...entries, { rewardId: '', weight: 0 }]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-600">Loot Table</label>
        <span className={`text-xs font-mono ${weightError ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
          Total: {total}/100{weightError ? ' ✗ must equal 100' : ' ✓'}
        </span>
      </div>
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            required
            placeholder="Reward ID"
            value={entry.rewardId}
            onChange={(e) => update(i, { rewardId: e.target.value })}
            className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            required
            type="number"
            min={1}
            max={100}
            placeholder="Weight"
            value={entry.weight || ''}
            onChange={(e) => update(i, { weight: Number(e.target.value) })}
            className="w-20 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400 w-8">{entry.weight}%</span>
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-red-400 hover:text-red-600 text-sm"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm text-blue-600 hover:text-blue-800"
      >
        + Add entry
      </button>
      {weightError && (
        <p className="text-xs text-red-600">Weights must sum to exactly 100 (currently {total})</p>
      )}
    </div>
  );
}

export function Rewards() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lootTable, setLootTable] = useState<LootEntry[]>([]);
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
      setLootTable([]);
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Failed to create reward');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.type === 'MYSTERY_BOX') {
      const total = lootTable.reduce((s, e) => s + e.weight, 0);
      if (lootTable.length === 0) {
        setFormError('Mystery Box requires at least one loot entry');
        return;
      }
      if (total !== 100) {
        setFormError(`Loot table weights must sum to 100 (currently ${total})`);
        return;
      }
      create.mutate({ name: form.name, type: form.type, rarity: form.rarity, config: {}, lootTable });
      return;
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(form.config);
    } catch {
      setFormError('Config must be valid JSON');
      return;
    }
    create.mutate({ name: form.name, type: form.type, rarity: form.rarity, config });
  }

  function openForm() {
    setShowForm(true);
    setForm(emptyForm);
    setLootTable([]);
    setFormError('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Rewards</h1>
        {isAdmin && (
          <button
            onClick={openForm}
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
            className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto"
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
                  onChange={(e) => {
                    setForm({ ...form, type: e.target.value });
                    if (e.target.value !== 'MYSTERY_BOX') setLootTable([]);
                  }}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ALL_TYPES.map((t) => (
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

            {form.type === 'MYSTERY_BOX' ? (
              <LootTableEditor entries={lootTable} onChange={setLootTable} />
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Config (JSON)
                  {form.type === 'ITEM' && <span className="text-gray-400 ml-1">e.g. {`{"material":"DIAMOND","amount":5}`}</span>}
                  {form.type === 'XP' && <span className="text-gray-400 ml-1">e.g. {`{"amount":500}`}</span>}
                  {form.type === 'COMMAND' && <span className="text-gray-400 ml-1">e.g. {`{"command":"give {player} diamond 1"}`}</span>}
                  {form.type === 'CURRENCY' && <span className="text-gray-400 ml-1">e.g. {`{"coins":500}`}</span>}
                </label>
                <textarea
                  required
                  rows={3}
                  value={form.config}
                  onChange={(e) => setForm({ ...form, config: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(emptyForm); setLootTable([]); setFormError(''); }}
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
          {ALL_TYPES.map((t) => (
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
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_BADGE[r.type] ?? 'bg-gray-100 text-gray-600'}`}>
                {r.type}
              </span>
              {r.type === 'MYSTERY_BOX' && r.lootTable && (
                <p className="text-xs text-gray-400 mt-1">{r.lootTable.length} loot entries</p>
              )}
              {r.grantCount !== undefined && (
                <p className="text-xs text-gray-400 mt-1">{r.grantCount} grants</p>
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
