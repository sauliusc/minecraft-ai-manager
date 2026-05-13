import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

type NpcType = 'GUIDE' | 'QUEST_GIVER' | 'MERCHANT';

interface NpcDefinition {
  id: string;
  name: string;
  skinUrl: string;
  title: string;
  locWorld: string;
  locX: number;
  locY: number;
  locZ: number;
  locYaw: number;
  type: NpcType;
  dialogueLines: string[];
  questIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface NpcFormData {
  name: string;
  title: string;
  skinUrl: string;
  locWorld: string;
  locX: string;
  locY: string;
  locZ: string;
  locYaw: string;
  type: NpcType;
  dialogueLines: string;
  questIds: string;
}

const EMPTY_FORM: NpcFormData = {
  name: '',
  title: '',
  skinUrl: '',
  locWorld: 'world',
  locX: '0',
  locY: '64',
  locZ: '0',
  locYaw: '0',
  type: 'GUIDE',
  dialogueLines: '',
  questIds: '',
};

const TYPE_BADGE: Record<NpcType, string> = {
  GUIDE: 'bg-blue-100 text-blue-700',
  QUEST_GIVER: 'bg-yellow-100 text-yellow-700',
  MERCHANT: 'bg-green-100 text-green-700',
};

function npcToForm(npc: NpcDefinition): NpcFormData {
  return {
    name: npc.name,
    title: npc.title,
    skinUrl: npc.skinUrl,
    locWorld: npc.locWorld,
    locX: String(npc.locX),
    locY: String(npc.locY),
    locZ: String(npc.locZ),
    locYaw: String(npc.locYaw),
    type: npc.type,
    dialogueLines: npc.dialogueLines.join('\n'),
    questIds: npc.questIds.join('\n'),
  };
}

function formToPayload(form: NpcFormData) {
  return {
    name: form.name,
    title: form.title,
    skinUrl: form.skinUrl,
    locWorld: form.locWorld,
    locX: Number(form.locX),
    locY: Number(form.locY),
    locZ: Number(form.locZ),
    locYaw: Number(form.locYaw),
    type: form.type,
    dialogueLines: form.dialogueLines.split('\n').map((l) => l.trim()).filter(Boolean),
    questIds: form.questIds.split('\n').map((l) => l.trim()).filter(Boolean),
  };
}

function NpcForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
  error,
}: {
  initial: NpcFormData;
  onSubmit: (data: NpcFormData) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string;
}) {
  const [form, setForm] = useState<NpcFormData>(initial);
  const inp = 'w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  function set(k: keyof NpcFormData, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Town Elder" className={inp} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Skin URL</label>
        <input value={form.skinUrl} onChange={(e) => set('skinUrl', e.target.value)} placeholder="https://textures.minecraft.net/..." className={inp} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value)} className={inp}>
            <option value="GUIDE">Guide</option>
            <option value="QUEST_GIVER">Quest Giver</option>
            <option value="MERCHANT">Merchant</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">World</label>
          <input value={form.locWorld} onChange={(e) => set('locWorld', e.target.value)} className={inp} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">X</label>
          <input type="number" value={form.locX} onChange={(e) => set('locX', e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Y</label>
          <input type="number" value={form.locY} onChange={(e) => set('locY', e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Z</label>
          <input type="number" value={form.locZ} onChange={(e) => set('locZ', e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Yaw</label>
          <input type="number" value={form.locYaw} onChange={(e) => set('locYaw', e.target.value)} className={inp} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Dialogue Lines <span className="text-gray-400">(one per line)</span>
        </label>
        <textarea
          rows={4}
          value={form.dialogueLines}
          onChange={(e) => set('dialogueLines', e.target.value)}
          placeholder={"Welcome, <player>!\nHow can I help you today?"}
          className={`${inp} font-mono`}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Quest IDs <span className="text-gray-400">(one per line)</span>
        </label>
        <textarea
          rows={2}
          value={form.questIds}
          onChange={(e) => set('questIds', e.target.value)}
          placeholder="quest-id-1&#10;quest-id-2"
          className={`${inp} font-mono`}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm border rounded hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save NPC'}
        </button>
      </div>
    </form>
  );
}

export function Npcs() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<NpcDefinition | null>(null);
  const [formError, setFormError] = useState('');

  const { data: npcs = [], isLoading } = useQuery<NpcDefinition[]>({
    queryKey: ['npcs'],
    queryFn: () => api.get('/npcs').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      api.post('/npcs', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['npcs'] });
      setShowModal(false);
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to create NPC');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof formToPayload> }) =>
      api.patch(`/npcs/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['npcs'] });
      setShowModal(false);
      setEditTarget(null);
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to update NPC');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/npcs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['npcs'] });
    },
  });

  function openCreate() {
    setEditTarget(null);
    setFormError('');
    setShowModal(true);
  }

  function openEdit(npc: NpcDefinition) {
    setEditTarget(npc);
    setFormError('');
    setShowModal(true);
  }

  function handleSubmit(form: NpcFormData) {
    const payload = formToPayload(form);
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(npc: NpcDefinition) {
    if (!confirm(`Delete NPC "${npc.name}"?`)) return;
    deleteMutation.mutate(npc.id);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">NPCs</h1>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700"
          >
            + Add NPC
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Location</th>
              <th className="px-4 py-3 text-left">Dialogue Lines</th>
              {isAdmin && <th className="px-4 py-3 text-left">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : npcs.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-gray-400">
                  No NPCs defined yet
                </td>
              </tr>
            ) : (
              npcs.map((npc) => (
                <tr key={npc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{npc.name}</div>
                    {npc.title && <div className="text-xs text-gray-400">{npc.title}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[npc.type]}`}>
                      {npc.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {npc.locWorld} ({npc.locX}, {npc.locY}, {npc.locZ})
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {npc.dialogueLines.length} line{npc.dialogueLines.length !== 1 ? 's' : ''}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(npc)}
                          className="text-xs px-3 py-1 border rounded hover:bg-gray-50 text-gray-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(npc)}
                          disabled={deleteMutation.isPending}
                          className="text-xs px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                {editTarget ? `Edit NPC — ${editTarget.name}` : 'Add NPC'}
              </h2>
              <NpcForm
                initial={editTarget ? npcToForm(editTarget) : EMPTY_FORM}
                onSubmit={handleSubmit}
                onCancel={() => { setShowModal(false); setEditTarget(null); setFormError(''); }}
                isPending={isPending}
                error={formError}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
