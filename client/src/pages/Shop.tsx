import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface ShopItem {
  id: string;
  material: string;
  displayName: string | null;
  amount: number;
  price: number;
  currency: string;
  category: string;
  enabled: boolean;
  sortOrder: number;
}

const EMPTY = {
  material: '',
  displayName: '',
  amount: 1,
  price: 10,
  category: 'General',
  sortOrder: 0,
};

/** Handful of common materials, so nobody has to remember the exact spelling. */
const SUGGESTIONS = [
  'DIAMOND', 'IRON_INGOT', 'GOLD_INGOT', 'EMERALD', 'NETHERITE_INGOT',
  'OAK_LOG', 'STONE', 'COBBLESTONE', 'GLASS', 'TORCH',
  'GOLDEN_APPLE', 'COOKED_BEEF', 'BREAD', 'ENDER_PEARL', 'EXPERIENCE_BOTTLE',
  'DIAMOND_SWORD', 'DIAMOND_PICKAXE', 'ELYTRA', 'SHULKER_BOX',
];

export function Shop() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN';

  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: ShopItem[] }>({
    queryKey: ['shop'],
    queryFn: () => api.get('/shop').then((r) => r.data),
  });
  const items = data?.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['shop'] });
  const fail = (e: any) => setError(e?.response?.data?.message ?? 'Request failed');

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/shop', body),
    onSuccess: () => { setForm({ ...EMPTY }); setError(null); invalidate(); },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/shop/${id}`, body),
    onSuccess: () => { setEditing(null); setError(null); invalidate(); },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/shop/${id}`),
    onSuccess: () => { setError(null); invalidate(); },
    onError: fail,
  });

  const byCategory = items.reduce<Record<string, ShopItem[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Shop</h1>
        <p className="text-sm text-gray-500 mt-1">
          What players can buy with <span className="font-medium">/shop</span> in game. Changes take
          effect the next time someone opens it — no restart needed.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      {isAdmin && (
        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Add an item</h2>
          <form
            className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                material: form.material.trim().toUpperCase(),
                displayName: form.displayName.trim() || null,
                amount: Number(form.amount),
                price: Number(form.price),
                category: form.category.trim() || 'General',
                sortOrder: Number(form.sortOrder),
              });
            }}
          >
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
              <input
                required list="material-suggestions" value={form.material}
                onChange={(e) => setForm({ ...form, material: e.target.value })}
                placeholder="DIAMOND"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono uppercase"
              />
              <datalist id="material-suggestions">
                {SUGGESTIONS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
              <input
                type="number" min={1} max={64} required value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Price (coins)</label>
              <input
                type="number" min={1} required value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit" disabled={create.isPending}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending ? 'Adding…' : 'Add'}
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-2">
            Material must be a Minecraft material name. If the server does not recognise it, the item
            is hidden from the in-game shop and a warning is logged rather than players being charged
            for nothing.
          </p>
        </section>
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-5">
          Nothing is for sale yet. Players who type <span className="font-mono">/shop</span> are told
          the shop is empty.
        </p>
      ) : (
        Object.entries(byCategory).map(([category, list]) => (
          <section key={category} className="bg-white rounded-lg shadow overflow-hidden">
            <h2 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
              {category} <span className="text-gray-400 font-normal">({list.length})</span>
            </h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Price</th>
                  <th className="px-4 py-2 text-left">In shop</th>
                  {isAdmin && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((item) => (
                  <tr key={item.id} className={item.enabled ? '' : 'opacity-50'}>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs text-gray-500">{item.material}</span>
                      {item.displayName && (
                        <span className="ml-2 text-gray-800">{item.displayName}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{item.amount}</td>
                    <td className="px-4 py-2">
                      {editing === item.id ? (
                        <span className="flex items-center gap-2">
                          <input
                            type="number" min={1} value={draftPrice} autoFocus
                            onChange={(e) => setDraftPrice(Number(e.target.value))}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                          <button
                            onClick={() => update.mutate({ id: item.id, body: { price: draftPrice } })}
                            className="text-indigo-600 text-xs font-medium hover:underline"
                          >Save</button>
                          <button
                            onClick={() => setEditing(null)}
                            className="text-gray-400 text-xs hover:underline"
                          >Cancel</button>
                        </span>
                      ) : (
                        <button
                          disabled={!isAdmin}
                          onClick={() => { setEditing(item.id); setDraftPrice(item.price); }}
                          className={isAdmin ? 'hover:underline' : 'cursor-default'}
                        >
                          {item.price} <span className="text-gray-400">{item.currency}</span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox" className="sr-only peer" checked={item.enabled}
                          disabled={!isAdmin}
                          onChange={(e) =>
                            update.mutate({ id: item.id, body: { enabled: e.target.checked } })}
                        />
                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:bg-white after:rounded-full after:h-4 after:w-4 after:ml-0.5 after:transition-all peer-checked:after:translate-x-4 relative" />
                      </label>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${item.material} from the shop?`)) remove.mutate(item.id);
                          }}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >Remove</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      {!isAdmin && (
        <p className="text-xs text-gray-400">Only Super Admins can change the shop.</p>
      )}
    </div>
  );
}
