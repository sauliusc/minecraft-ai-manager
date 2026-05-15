import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

type Channel = 'CHAT' | 'TITLE' | 'ACTION_BAR' | 'DISCORD';
type TriggerType = 'DAILY_LOGIN' | 'MILESTONE' | 'LOW_ACTIVITY';

interface BroadcastMessage {
  id: string;
  content: string;
  channels: Channel[];
  audience: string;
  scheduledAt: string | null;
  sentAt: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'SENT' | 'CANCELLED';
  createdBy: string;
  createdAt: string;
}

interface BroadcastTrigger {
  type: TriggerType;
  enabled: boolean;
  config: Record<string, unknown>;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  DAILY_LOGIN: 'Daily Login',
  MILESTONE: 'Milestone',
  LOW_ACTIVITY: 'Low Activity Alert',
};

const TRIGGER_DESCRIPTIONS: Record<TriggerType, string> = {
  DAILY_LOGIN: 'Broadcast to a player when they log in for the first time each day.',
  MILESTONE: 'Broadcast to all players when a server milestone is reached.',
  LOW_ACTIVITY: 'Broadcast to admins when online player count drops below the threshold.',
};

const ALL_TRIGGER_TYPES: TriggerType[] = ['DAILY_LOGIN', 'MILESTONE', 'LOW_ACTIVITY'];

const CHANNEL_LABELS: Record<Channel, string> = {
  CHAT: 'Chat',
  TITLE: 'Title',
  ACTION_BAR: 'Action Bar',
  DISCORD: 'Discord',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

const AUDIENCE_OPTIONS = [
  { value: 'ALL', label: 'All Players' },
  { value: 'VIP', label: 'VIP' },
  { value: 'MODS', label: 'Moderators' },
  { value: 'NEW', label: 'New Players (last 7 days)' },
];

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Broadcast() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [content, setContent] = useState('');
  const [channels, setChannels] = useState<Set<Channel>>(new Set(['CHAT']));
  const [audience, setAudience] = useState('ALL');
  const [scheduledAt, setScheduledAt] = useState('');
  const [formError, setFormError] = useState('');

  // Trigger config state: map from type → {enabled, config}
  const [triggerEdits, setTriggerEdits] = useState<Record<string, { enabled: boolean; config: string }>>({});
  const [triggerSaved, setTriggerSaved] = useState(false);

  const triggers = useQuery<BroadcastTrigger[]>({
    queryKey: ['broadcast', 'triggers'],
    queryFn: () => api.get('/broadcast/triggers').then((r) => r.data),
    enabled: isSuperAdmin,
  });

  const saveTriggers = useMutation({
    mutationFn: (body: object[]) => api.put('/broadcast/triggers', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcast', 'triggers'] });
      setTriggerSaved(true);
      setTimeout(() => setTriggerSaved(false), 2000);
    },
  });

  const scheduled = useQuery<BroadcastMessage[]>({
    queryKey: ['broadcast', 'scheduled'],
    queryFn: () => api.get('/broadcast/scheduled').then((r) => r.data),
  });

  const sendMutation = useMutation({
    mutationFn: (body: object) => api.post('/broadcast', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcast'] });
      setContent('');
      setChannels(new Set(['CHAT']));
      setAudience('ALL');
      setScheduledAt('');
      setFormError('');
    },
    onError: (e: any) => {
      setFormError(e?.message ?? 'Failed to send broadcast');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/broadcast/scheduled/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcast'] }),
  });

  function getTriggerState(type: TriggerType) {
    const edit = triggerEdits[type];
    if (edit) return edit;
    const saved = triggers.data?.find((t) => t.type === type);
    return {
      enabled: saved?.enabled ?? false,
      config: saved ? JSON.stringify(saved.config, null, 2) : '{}',
    };
  }

  function setTriggerField(type: TriggerType, field: 'enabled' | 'config', value: boolean | string) {
    setTriggerEdits((prev) => ({
      ...prev,
      [type]: { ...getTriggerState(type), [field]: value },
    }));
  }

  function handleSaveTriggers(e: React.FormEvent) {
    e.preventDefault();
    const payload = ALL_TRIGGER_TYPES.map((type) => {
      const { enabled, config } = getTriggerState(type);
      let parsedConfig: Record<string, unknown>;
      try { parsedConfig = JSON.parse(config); } catch { parsedConfig = {}; }
      return { type, enabled, config: parsedConfig };
    });
    saveTriggers.mutate(payload);
  }

  function toggleChannel(ch: Channel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        if (next.size === 1) return prev;
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) { setFormError('Message content is required.'); return; }
    const body: Record<string, unknown> = {
      content: content.trim(),
      channels: Array.from(channels),
      audience,
    };
    if (scheduledAt) {
      body.scheduledAt = new Date(scheduledAt).toISOString();
    }
    sendMutation.mutate(body);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Broadcast</h1>

      {/* Composer */}
      {isSuperAdmin ? (
        <section className="bg-white rounded-lg shadow p-6 max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Message</h2>
          <form onSubmit={handleSend} className="space-y-5">
            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Broadcast message text…"
                maxLength={500}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{content.length}/500</p>
            </div>

            {/* Channels */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Channels</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(CHANNEL_LABELS) as Channel[]).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      channels.has(ch)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                    }`}
                  >
                    {CHANNEL_LABELS[ch]}
                  </button>
                ))}
              </div>
            </div>

            {/* Audience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
              <select
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                {AUDIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Schedule <span className="font-normal text-gray-400">(leave blank to send now)</span>
              </label>
              <input
                type="datetime-local"
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={toLocalDatetimeValue(new Date().toISOString())}
              />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={sendMutation.isPending}
                className="px-5 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {sendMutation.isPending
                  ? 'Sending…'
                  : scheduledAt
                  ? 'Schedule'
                  : 'Send Now'}
              </button>
              {sendMutation.isSuccess && (
                <span className="text-sm text-green-600">
                  {scheduledAt ? 'Scheduled!' : 'Sent!'}
                </span>
              )}
            </div>
          </form>
        </section>
      ) : (
        <p className="text-gray-500 text-sm">Only Super Admins can send broadcasts.</p>
      )}

      {/* Scheduled queue */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Scheduled & Drafts</h2>
        {scheduled.isLoading ? (
          <p className="text-gray-400">Loading…</p>
        ) : !scheduled.data || scheduled.data.length === 0 ? (
          <p className="text-gray-400">No scheduled messages.</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Message</th>
                  <th className="px-4 py-3 text-left">Channels</th>
                  <th className="px-4 py-3 text-left">Audience</th>
                  <th className="px-4 py-3 text-left">Scheduled At</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  {isSuperAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scheduled.data.map((msg) => (
                  <tr key={msg.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800 max-w-xs truncate">{msg.content}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {msg.channels.map((c) => CHANNEL_LABELS[c]).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{msg.audience}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {msg.scheduledAt
                        ? new Date(msg.scheduledAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[msg.status]}`}>
                        {msg.status}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-right">
                        {msg.status === 'SCHEDULED' && (
                          <button
                            onClick={() => cancelMutation.mutate(msg.id)}
                            disabled={cancelMutation.isPending}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {/* Automated Triggers */}
      {isSuperAdmin && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Automated Triggers</h2>
          {triggers.isLoading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : (
            <form onSubmit={handleSaveTriggers} className="bg-white rounded-lg shadow divide-y">
              {ALL_TRIGGER_TYPES.map((type) => {
                const { enabled, config } = getTriggerState(type);
                return (
                  <div key={type} className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{TRIGGER_LABELS[type]}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{TRIGGER_DESCRIPTIONS[type]}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={enabled}
                          onChange={(e) => setTriggerField(type, 'enabled', e.target.checked)}
                        />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Config (JSON)</label>
                      <textarea
                        rows={3}
                        value={config}
                        onChange={(e) => setTriggerField(type, 'config', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                      />
                    </div>
                  </div>
                );
              })}
              <div className="px-5 py-4 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saveTriggers.isPending}
                  className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saveTriggers.isPending ? 'Saving…' : 'Save Triggers'}
                </button>
                {triggerSaved && <span className="text-sm text-green-600">Saved!</span>}
                {saveTriggers.isError && <span className="text-sm text-red-600">Save failed</span>}
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
