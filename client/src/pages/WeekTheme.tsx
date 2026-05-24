import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type WeekThemeStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

interface DailyChallenge {
  dayOffset: number;
  title: string;
  description: string;
  type: string;
  difficulty: number;
  config: Record<string, unknown>;
}

interface WeekThemePayload {
  description: string;
  event: {
    type: string;
    title: string;
    config: Record<string, unknown>;
  };
  dailyChallenges: DailyChallenge[];
  weeklyChallenge: {
    title: string;
    description: string;
    type: string;
    difficulty: number;
    config: Record<string, unknown>;
  };
  npc: {
    name: string;
    title: string;
    type: string;
    dialogueLines: string[];
  };
  rewards: Array<{
    name: string;
    type: string;
    rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
    config: Record<string, unknown>;
  }>;
  announcementText: string;
}

interface WeekTheme {
  id: string;
  theme: string;
  description: string;
  startDate: string;
  endDate: string;
  status: WeekThemeStatus;
  aiPayload: WeekThemePayload;
  announcementText: string | null;
  createdBy: string;
  createdAt: string;
  activatedAt: string | null;
  activatedBy: string | null;
  eventId: string | null;
  npcId: string | null;
  challengeIds: string[];
  rewardIds: string[];
}

interface WeekThemeListResponse {
  data: WeekTheme[];
  meta: { total: number; page: number; pages: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  COMMON: 'text-gray-600 bg-gray-100',
  RARE: 'text-blue-700 bg-blue-100',
  EPIC: 'text-purple-700 bg-purple-100',
  LEGENDARY: 'text-yellow-700 bg-yellow-100',
};

const STATUS_COLORS: Record<WeekThemeStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-blue-100 text-blue-600',
  CANCELLED: 'bg-red-100 text-red-600',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Stars({ n }: { n: number }) {
  return (
    <span className="text-yellow-400 text-xs">
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Draft Preview ─────────────────────────────────────────────────────────────

function DraftPreview({
  theme,
  isSuperAdmin,
  onActivate,
  onDiscard,
  activating,
  discarding,
}: {
  theme: WeekTheme;
  isSuperAdmin: boolean;
  onActivate: () => void;
  onDiscard: () => void;
  activating: boolean;
  discarding: boolean;
}) {
  const payload = theme.aiPayload;

  return (
    <div className="bg-white border border-indigo-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-indigo-900">{theme.theme}</h2>
            <p className="text-sm text-indigo-700 mt-1">{payload.description}</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-semibold shrink-0 ${STATUS_COLORS[theme.status]}`}>
            {theme.status}
          </span>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-indigo-600">
          <span>{formatDate(theme.startDate)} – {formatDate(theme.endDate)}</span>
          <span>Created by {theme.createdBy}</span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Event */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Featured Event</h3>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded">
              {payload.event.type.replace('_', ' ')}
            </span>
            <span className="font-medium text-gray-800">{payload.event.title}</span>
          </div>
        </section>

        {/* Daily challenges table */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Daily Challenges</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Day</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Difficulty</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {payload.dailyChallenges.map((dc) => (
                  <tr key={dc.dayOffset}>
                    <td className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
                      {DAY_NAMES[dc.dayOffset] ?? `Day ${dc.dayOffset}`}
                    </td>
                    <td className="px-3 py-2 text-gray-800">{dc.title}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        {dc.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Stars n={dc.difficulty} />
                    </td>
                  </tr>
                ))}
                {/* Weekly challenge row (highlighted) */}
                <tr className="bg-indigo-50">
                  <td className="px-3 py-2 font-semibold text-indigo-700 whitespace-nowrap">Week</td>
                  <td className="px-3 py-2 text-indigo-800 font-medium">{payload.weeklyChallenge.title}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded">
                      {payload.weeklyChallenge.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Stars n={payload.weeklyChallenge.difficulty} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* NPC */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">NPC</h3>
          <div className="flex items-start gap-4 bg-gray-50 rounded-lg p-4 border">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
              {payload.npc.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">{payload.npc.name}</span>
                <span className="text-xs text-gray-500">{payload.npc.title}</span>
                <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
                  {payload.npc.type.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1 italic">"{payload.npc.dialogueLines[0]}"</p>
            </div>
          </div>
        </section>

        {/* Rewards */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Rewards</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {payload.rewards.map((r, i) => (
              <div key={i} className="bg-gray-50 border rounded-lg p-3 space-y-1.5">
                <span className="font-medium text-gray-800 text-sm block truncate" title={r.name}>{r.name}</span>
                <div className="flex flex-wrap gap-1">
                  <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
                    {r.type}
                  </span>
                  <span className={`px-1.5 py-0.5 text-xs rounded font-semibold ${RARITY_COLORS[r.rarity] ?? 'bg-gray-100 text-gray-600'}`}>
                    {r.rarity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Announcement */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Announcement</h3>
          <pre className="bg-gray-900 text-green-400 rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {payload.announcementText}
          </pre>
        </section>

        {/* Actions */}
        {isSuperAdmin && theme.status === 'DRAFT' && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={onActivate}
              disabled={activating}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {activating ? 'Activating…' : 'Activate'}
            </button>
            <button
              onClick={onDiscard}
              disabled={discarding}
              className="px-5 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {discarding ? 'Discarding…' : 'Discard'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function WeekTheme() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();

  const [themeName, setThemeName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [latestDraft, setLatestDraft] = useState<WeekTheme | null>(null);
  const [generateError, setGenerateError] = useState('');
  const [activateError, setActivateError] = useState('');

  // List of past themes
  const { data: listData, isLoading: listLoading } = useQuery<WeekThemeListResponse>({
    queryKey: ['week-themes'],
    queryFn: () => api.get('/ai/week-theme').then((r) => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post('/ai/week-theme/generate', { theme: themeName.trim(), startDate }),
    onSuccess: (res: { data: { data: WeekTheme } }) => {
      setLatestDraft(res.data.data);
      setGenerateError('');
      qc.invalidateQueries({ queryKey: ['week-themes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setGenerateError(err.response?.data?.message ?? String(err));
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/ai/week-theme/${id}/activate`),
    onSuccess: (res: { data: { data: WeekTheme } }) => {
      setLatestDraft(res.data.data);
      setActivateError('');
      qc.invalidateQueries({ queryKey: ['week-themes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setActivateError(err.response?.data?.message ?? String(err));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ai/week-theme/${id}`),
    onSuccess: (res: { data: { data: WeekTheme } }) => {
      setLatestDraft(res.data.data);
      setActivateError('');
      qc.invalidateQueries({ queryKey: ['week-themes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setActivateError(err.response?.data?.message ?? String(err));
    },
  });

  const themes = listData?.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Week Theme</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate a full week's coordinated content package — event, challenges, NPC, and rewards — in one click.
        </p>
      </div>

      {/* Generate form */}
      {isSuperAdmin && (
        <section className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-700">Generate New Week Theme</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-gray-500 block mb-1">Theme Name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Dragon Invasion, Halloween, Winter Wonderland"
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Start Date (Monday)</label>
              <input
                type="date"
                className="border rounded-lg px-3 py-2 text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={!themeName.trim() || !startDate || generateMutation.isPending}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
            >
              {generateMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating…
                </span>
              ) : (
                'Generate'
              )}
            </button>
          </div>

          {generateError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {generateError}
            </div>
          )}
        </section>
      )}

      {/* Draft preview */}
      {latestDraft && (
        <section>
          <h2 className="font-semibold text-gray-700 mb-3">Draft Preview</h2>
          {activateError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">
              {activateError}
            </div>
          )}
          <DraftPreview
            theme={latestDraft}
            isSuperAdmin={isSuperAdmin}
            onActivate={() => activateMutation.mutate(latestDraft.id)}
            onDiscard={() => cancelMutation.mutate(latestDraft.id)}
            activating={activateMutation.isPending}
            discarding={cancelMutation.isPending}
          />
        </section>
      )}

      {/* History table */}
      <section>
        <h2 className="font-semibold text-gray-700 mb-3">History</h2>
        {listLoading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!listLoading && themes.length === 0 && (
          <p className="text-gray-400 text-sm">No week themes yet.</p>
        )}

        {themes.length > 0 && (
          <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Dates</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created By</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {themes.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{t.theme}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {formatDate(t.startDate)} – {formatDate(t.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[t.status]}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{t.createdBy}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setLatestDraft(t)}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
