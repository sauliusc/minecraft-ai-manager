import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface CosmeticTitle {
  id: string;
  name: string;
  description: string;
}

export function Cosmetics() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: titles, isLoading } = useQuery<CosmeticTitle[]>({
    queryKey: ['cosmetics-titles'],
    queryFn: () => api.get('/cosmetics/titles').then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: (body: object) => api.post('/cosmetics/titles', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cosmetics-titles'] });
      setShowForm(false);
      setName('');
      setDescription('');
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to create title');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/cosmetics/titles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cosmetics-titles'] });
      setConfirmDelete(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    create.mutate({ name: name.trim(), description: description.trim() || undefined });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Cosmetics</h1>
        {isAdmin && (
          <button
            onClick={() => { setShowForm(true); setFormError(''); }}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700"
          >
            + New Title
          </button>
        )}
      </div>

      {/* Info panel about cosmetic types */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Titles', desc: 'Prefixes shown in chat and tab list. Managed here.' },
          { label: 'Chat Colors', desc: 'Player-selectable via /chatcolor. No DB required.' },
          { label: 'Particles', desc: 'Ambient particle effects via /particles.' },
          { label: 'Pets', desc: 'Baby entity companions via /pet.' },
          { label: 'Trails', desc: 'Ground particle trails via /trail.' },
        ].map(({ label, desc }) => (
          <div key={label} className="bg-white rounded-lg shadow p-3">
            <p className="text-sm font-medium text-gray-800">{label}</p>
            <p className="text-xs text-gray-500 mt-1">{desc}</p>
          </div>
        ))}
      </div>

      {/* Titles management */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">Available Titles</h2>
          <p className="text-xs text-gray-500 mt-0.5">Players equip titles via <code className="bg-gray-100 px-1 rounded">/title equip &lt;name&gt;</code></p>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-gray-400">Loading…</div>
        ) : !titles || titles.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">No titles yet. Create one to get started.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Description</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {titles.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-semibold mr-2">{t.name}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.description || '—'}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {confirmDelete === t.id ? (
                        <span className="inline-flex items-center gap-2">
                          <button
                            onClick={() => remove.mutate(t.id)}
                            disabled={remove.isPending}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs text-gray-400 hover:underline"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(t.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create title modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-800">New Title</h2>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name (shown in-game)</label>
              <input
                required
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Champion"
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
              <input
                maxLength={256}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Awarded to tournament winners"
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(''); }}
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
    </div>
  );
}
