import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type AiProvider = 'anthropic' | 'openrouter' | 'gemini';

interface AiCfg {
  provider?: AiProvider;
  // Anthropic
  api_key?: string;
  // OpenRouter
  openrouter_api_key?: string;
  // Gemini
  gemini_api_key?: string;
  // Models (override provider defaults)
  generator_model?: string;
  inference_model?: string;
  challenge_count?: string;
  enable_challenges?: string;
  enable_engagement?: string;
  enable_rewards?: string;
  enable_moderation?: string;
}

const PROVIDERS: { value: AiProvider; label: string; placeholder: string }[] = [
  { value: 'anthropic',  label: 'Anthropic (Claude)',  placeholder: 'sk-ant-…' },
  { value: 'openrouter', label: 'OpenRouter',          placeholder: 'sk-or-…' },
  { value: 'gemini',     label: 'Google Gemini',       placeholder: 'AIza…' },
];

const PROVIDER_KEY_FIELD: Record<AiProvider, keyof AiCfg> = {
  anthropic:  'api_key',
  openrouter: 'openrouter_api_key',
  gemini:     'gemini_api_key',
};

const PROVIDER_MODEL_HINTS: Record<AiProvider, { generator: string; inference: string }> = {
  anthropic:  { generator: 'claude-sonnet-4-6',           inference: 'claude-haiku-4-5' },
  openrouter: { generator: 'anthropic/claude-sonnet-4-6', inference: 'anthropic/claude-haiku-4-5' },
  gemini:     { generator: 'gemini-2.5-pro',              inference: 'gemini-2.0-flash' },
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic:  'Claude API',
  openrouter: 'OpenRouter',
  gemini:     'Gemini',
};

interface ChallengeDraft {
  id: string;
  confidence: number;
  reasoning: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  payload: {
    title: string;
    description: string;
    type: string;
    difficulty: number;
    questCategory: string;
  };
}

interface EngagementResult {
  playerUuid: string;
  username: string;
  riskScore: number;
  reasoning: string;
  recommendedAction: string;
}

interface RewardSuggestion {
  rewardId: string;
  name: string;
  type: string;
  rarity: string;
  reason: string;
}

interface ChatScanResult {
  logId: string;
  playerId: string;
  username: string;
  message: string;
  category: 'CLEAN' | 'MILD_TOXICITY' | 'HATE_SPEECH' | 'PERSONAL_THREAT' | 'SPAM';
  reasoning: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = ['Settings', 'Challenges', 'Engagement', 'Rewards', 'Moderation'] as const;
type Tab = (typeof TABS)[number];

const RARITY_COLORS: Record<string, string> = {
  COMMON: 'text-gray-600 bg-gray-100',
  RARE: 'text-blue-700 bg-blue-100',
  EPIC: 'text-purple-700 bg-purple-100',
  LEGENDARY: 'text-yellow-700 bg-yellow-100',
};

const CHAT_COLORS: Record<string, string> = {
  CLEAN: 'bg-green-100 text-green-700',
  MILD_TOXICITY: 'bg-yellow-100 text-yellow-700',
  HATE_SPEECH: 'bg-red-100 text-red-700',
  PERSONAL_THREAT: 'bg-red-200 text-red-800',
  SPAM: 'bg-orange-100 text-orange-700',
};

function RiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.7 ? 'bg-red-500' : score >= 0.4 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono">{pct}%</span>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="text-yellow-400">
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ data: AiCfg }>({
    queryKey: ['ai-config'],
    queryFn: () => api.get('/ai/config').then((r) => r.data),
  });

  const [form, setForm] = useState<AiCfg>({});
  const cfg = data?.data ?? {};

  const set = (k: keyof AiCfg, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const val = (k: keyof AiCfg) => (form[k] !== undefined ? form[k] : cfg[k] ?? '');

  const saveMutation = useMutation({
    mutationFn: () => api.put('/ai/config', { ...cfg, ...form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-config'] }); setForm({}); },
  });

  const toggle = (k: keyof AiCfg) => set(k, val(k) === 'false' ? 'true' : 'false');
  const isOn = (k: keyof AiCfg) => val(k) !== 'false';

  const provider: AiProvider = (val('provider') as AiProvider) || 'anthropic';
  const keyField = PROVIDER_KEY_FIELD[provider];
  const modelHints = PROVIDER_MODEL_HINTS[provider];
  const providerInfo = PROVIDERS.find((p) => p.value === provider)!;
  const keySaved = !!cfg[keyField];

  return (
    <div className="space-y-6 max-w-xl">
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        Settings are stored in the database. API keys are never returned to the browser after saving.
      </div>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-700">AI Provider</h3>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={!isSuperAdmin}
              onClick={() => set('provider', p.value)}
              className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                provider === p.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {provider === 'openrouter' && (
          <p className="text-xs text-gray-500">
            OpenRouter lets you use any model (Claude, GPT-4o, Gemini, Llama, etc.) through a single API.
            Get a key at <span className="font-mono">openrouter.ai</span>.
          </p>
        )}
        {provider === 'gemini' && (
          <p className="text-xs text-gray-500">
            Uses Google's Gemini API via the OpenAI-compatible endpoint.
            Get a key at <span className="font-mono">aistudio.google.com</span>.
          </p>
        )}
        {provider === 'anthropic' && (
          <p className="text-xs text-gray-500">
            Uses Anthropic's Claude API directly.
            Get a key at <span className="font-mono">console.anthropic.com</span>.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-700">{providerInfo.label} API Key</h3>
        <input
          type="password"
          placeholder={keySaved ? 'Key saved — paste new key to replace' : providerInfo.placeholder}
          value={(form[keyField] as string | undefined) ?? ''}
          onChange={(e) => set(keyField, e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm font-mono"
          disabled={!isSuperAdmin}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-700">Models</h3>
        <p className="text-xs text-gray-400">Leave blank to use provider defaults.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Generator (complex tasks)</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={val('generator_model')}
              onChange={(e) => set('generator_model', e.target.value)}
              placeholder={modelHints.generator}
              disabled={!isSuperAdmin}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Inference (real-time)</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={val('inference_model')}
              onChange={(e) => set('inference_model', e.target.value)}
              placeholder={modelHints.inference}
              disabled={!isSuperAdmin}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-700">Feature Toggles</h3>
        {(
          [
            ['enable_challenges', 'Challenge Generator'],
            ['enable_engagement', 'Engagement Analysis'],
            ['enable_rewards', 'Reward Suggestions'],
            ['enable_moderation', 'Chat Moderation Scanner'],
          ] as [keyof AiCfg, string][]
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => isSuperAdmin && toggle(k)}
              className={`relative w-10 h-5 rounded-full transition-colors ${isOn(k) ? 'bg-green-500' : 'bg-gray-300'} ${!isSuperAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isOn(k) ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </section>

      {isSuperAdmin && (
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || Object.keys(form).length === 0}
          className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      )}
    </div>
  );
}

// ── Challenges tab ────────────────────────────────────────────────────────────

function ChallengesTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const [theme, setTheme] = useState('');

  const { data: draftsData, isLoading } = useQuery<{ data: ChallengeDraft[] }>({
    queryKey: ['ai-challenge-drafts'],
    queryFn: () => api.get('/ai/challenges/drafts').then((r) => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/ai/challenges/generate', { theme }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-challenge-drafts'] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/ai/challenges/drafts/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-challenge-drafts'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ai/challenges/drafts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-challenge-drafts'] }),
  });

  const pending = draftsData?.data.filter((d) => d.status === 'PENDING') ?? [];
  const reviewed = draftsData?.data.filter((d) => d.status !== 'PENDING') ?? [];

  return (
    <div className="space-y-5">
      {isSuperAdmin && (
        <div className="flex gap-3 items-center">
          <input
            className="border rounded px-3 py-2 text-sm flex-1 max-w-sm"
            placeholder="Optional theme hint (e.g. 'Halloween event')"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          />
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          >
            {generateMutation.isPending ? 'Generating…' : 'Generate 3 Challenges'}
          </button>
        </div>
      )}

      {generateMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {String(generateMutation.error)}
        </div>
      )}

      {pending.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-700 mb-3">Pending Review ({pending.length})</h3>
          <div className="space-y-3">
            {pending.map((d) => (
              <div key={d.id} className="bg-white border rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-800">{d.payload.title}</span>
                      <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">{d.payload.type}</span>
                      <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">{d.payload.questCategory}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
                      <Stars n={d.payload.difficulty} />
                      <span>Confidence: {Math.round(d.confidence * 100)}%</span>
                    </div>
                    <p className="text-sm text-gray-600 italic">{d.reasoning}</p>
                  </div>
                  {isSuperAdmin && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveMutation.mutate(d.id)}
                        disabled={approveMutation.isPending}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(d.id)}
                        disabled={rejectMutation.isPending}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {reviewed.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">Recently Reviewed</h3>
          <div className="divide-y border rounded-lg overflow-hidden bg-white">
            {reviewed.slice(0, 10).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${d.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {d.status}
                </span>
                <span className="text-gray-700">{d.payload.title}</span>
                <span className="text-gray-400 text-xs ml-auto">{d.payload.type}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {isLoading && <p className="text-gray-400 text-sm">Loading drafts…</p>}
      {!isLoading && pending.length === 0 && reviewed.length === 0 && (
        <p className="text-gray-400 text-sm">No drafts yet. Click Generate to create challenge suggestions.</p>
      )}
    </div>
  );
}

// ── Engagement tab ────────────────────────────────────────────────────────────

function EngagementTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'risk' | 'watch' | 'healthy'>('all');

  const { data: scanData } = useQuery<{ data: { results: EngagementResult[]; scannedAt: string } | null }>({
    queryKey: ['ai-engagement'],
    queryFn: () => api.get('/ai/engagement/latest').then((r) => r.data),
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post('/ai/engagement/scan', { limit: 100 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-engagement'] }),
  });

  const scan = scanData?.data;
  const results: EngagementResult[] = (scan?.results as EngagementResult[]) ?? [];

  const filtered = results.filter((r) => {
    if (filter === 'risk') return r.riskScore >= 0.7;
    if (filter === 'watch') return r.riskScore >= 0.4 && r.riskScore < 0.7;
    if (filter === 'healthy') return r.riskScore < 0.4;
    return true;
  });

  const counts = {
    risk: results.filter((r) => r.riskScore >= 0.7).length,
    watch: results.filter((r) => r.riskScore >= 0.4 && r.riskScore < 0.7).length,
    healthy: results.filter((r) => r.riskScore < 0.4).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        {isSuperAdmin && (
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {scanMutation.isPending ? 'Scanning…' : 'Scan Players'}
          </button>
        )}
        {scan && (
          <span className="text-xs text-gray-400">
            Last scan: {new Date(scan.scannedAt).toLocaleString()}
          </span>
        )}
      </div>

      {scanMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {String(scanMutation.error)}
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="flex gap-3">
            {([['all', 'All', 'bg-gray-100 text-gray-700'], ['risk', `At Risk (${counts.risk})`, 'bg-red-100 text-red-700'], ['watch', `Watch (${counts.watch})`, 'bg-yellow-100 text-yellow-700'], ['healthy', `Healthy (${counts.healthy})`, 'bg-green-100 text-green-700']] as const).map(
              ([f, label, cls]) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${filter === f ? cls + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500'}`}
                >
                  {label}
                </button>
              )
            )}
          </div>

          <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Player</th>
                  <th className="px-4 py-2 text-left">Risk</th>
                  <th className="px-4 py-2 text-left">Reasoning</th>
                  <th className="px-4 py-2 text-left">Recommended Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.playerUuid}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.username}</td>
                    <td className="px-4 py-2.5">
                      <RiskBar score={r.riskScore} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-xs">{r.reasoning}</td>
                    <td className="px-4 py-2.5 text-indigo-700 text-xs">{r.recommendedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!scan && !scanMutation.isPending && (
        <p className="text-gray-400 text-sm">No scan results yet. Click Scan Players to analyse engagement.</p>
      )}
    </div>
  );
}

// ── Rewards tab ───────────────────────────────────────────────────────────────

function RewardsTab() {
  const [playerUuid, setPlayerUuid] = useState('');
  const [suggestions, setSuggestions] = useState<RewardSuggestion[] | null>(null);
  const [error, setError] = useState('');

  const suggestMutation = useMutation({
    mutationFn: () => api.post('/ai/rewards/suggest', { playerUuid: playerUuid.trim() }),
    onSuccess: (res) => { setSuggestions(res.data.data); setError(''); },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      setError(err.response?.data?.message ?? 'Suggestion failed'),
  });

  return (
    <div className="space-y-5">
      <div className="flex gap-3 items-center">
        <input
          className="border rounded px-3 py-2 text-sm w-80 font-mono"
          placeholder="Player UUID (e.g. 069a79f4-…)"
          value={playerUuid}
          onChange={(e) => setPlayerUuid(e.target.value)}
        />
        <button
          onClick={() => suggestMutation.mutate()}
          disabled={!playerUuid.trim() || suggestMutation.isPending}
          className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {suggestMutation.isPending ? 'Thinking…' : 'Suggest Rewards'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">{error}</div>}

      {suggestions && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {suggestions.map((s, i) => (
            <div key={s.rewardId} className="bg-white border rounded-lg p-4 shadow-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs font-bold">#{i + 1}</span>
                <span className="font-semibold text-gray-800 truncate">{s.name}</span>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">{s.type}</span>
                <span className={`px-2 py-0.5 text-xs rounded font-semibold ${RARITY_COLORS[s.rarity] ?? 'bg-gray-100 text-gray-600'}`}>{s.rarity}</span>
              </div>
              <p className="text-sm text-gray-600 italic">{s.reason}</p>
            </div>
          ))}
        </div>
      )}

      {!suggestions && !suggestMutation.isPending && (
        <p className="text-gray-400 text-sm">Enter a player UUID and click Suggest Rewards to get personalised recommendations.</p>
      )}
    </div>
  );
}

// ── Moderation tab ────────────────────────────────────────────────────────────

function ModerationTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const [filterCat, setFilterCat] = useState<string>('all');
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  const { data: scanData } = useQuery<{ data: { results: ChatScanResult[]; scannedAt: string } | null }>({
    queryKey: ['ai-chat-scan'],
    queryFn: () => api.get('/ai/moderation/latest').then((r) => r.data),
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post('/ai/moderation/scan', { limit: 50 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-chat-scan'] }),
  });

  const flagMutation = useMutation({
    mutationFn: (logId: string) => api.post(`/ai/moderation/flag/${logId}`),
    onSuccess: (_res, logId) => setFlaggedIds((s) => new Set([...s, logId])),
  });

  const scan = scanData?.data;
  const results: ChatScanResult[] = (scan?.results as ChatScanResult[]) ?? [];
  const cats = ['all', 'CLEAN', 'MILD_TOXICITY', 'HATE_SPEECH', 'PERSONAL_THREAT', 'SPAM'];
  const filtered = filterCat === 'all' ? results : results.filter((r) => r.category === filterCat);
  const nonClean = results.filter((r) => r.category !== 'CLEAN');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        {isSuperAdmin && (
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {scanMutation.isPending ? 'Scanning…' : 'Scan Last 50 Messages'}
          </button>
        )}
        {scan && (
          <span className="text-xs text-gray-400">Last scan: {new Date(scan.scannedAt).toLocaleString()}</span>
        )}
      </div>

      {scanMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {String(scanMutation.error)}
        </div>
      )}

      {results.length > 0 && (
        <>
          {nonClean.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm text-orange-800">
              {nonClean.length} message{nonClean.length !== 1 ? 's' : ''} flagged for potential issues.
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setFilterCat(c)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${filterCat === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
              >
                {c === 'all' ? `All (${results.length})` : `${c.replace('_', ' ')} (${results.filter((r) => r.category === c).length})`}
              </button>
            ))}
          </div>

          <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Player</th>
                  <th className="px-4 py-2 text-left">Message</th>
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-left">Reasoning</th>
                  {isSuperAdmin && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.logId} className={r.category !== 'CLEAN' ? 'bg-red-50/30' : ''}>
                    <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{r.username}</td>
                    <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate" title={r.message}>
                      {r.message}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CHAT_COLORS[r.category] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs">{r.reasoning}</td>
                    {isSuperAdmin && (
                      <td className="px-4 py-2.5">
                        {r.category !== 'CLEAN' && !flaggedIds.has(r.logId) && (
                          <button
                            onClick={() => flagMutation.mutate(r.logId)}
                            disabled={flagMutation.isPending}
                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                          >
                            Flag
                          </button>
                        )}
                        {flaggedIds.has(r.logId) && (
                          <span className="text-xs text-gray-400">Flagged</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!scan && !scanMutation.isPending && (
        <p className="text-gray-400 text-sm">No scan results yet. Click Scan to analyse recent chat messages.</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AiConfig() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<Tab>('Settings');

  const { data: configData } = useQuery<{ data: AiCfg }>({
    queryKey: ['ai-config'],
    queryFn: () => api.get('/ai/config').then((r) => r.data),
  });
  const activeProvider: AiProvider = (configData?.data?.provider as AiProvider) ?? 'anthropic';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-800">AI Features</h1>
        <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 font-semibold">
          {PROVIDER_LABELS[activeProvider]}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-500 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'Settings' && <SettingsTab isSuperAdmin={isSuperAdmin} />}
        {tab === 'Challenges' && <ChallengesTab isSuperAdmin={isSuperAdmin} />}
        {tab === 'Engagement' && <EngagementTab isSuperAdmin={isSuperAdmin} />}
        {tab === 'Rewards' && <RewardsTab />}
        {tab === 'Moderation' && <ModerationTab isSuperAdmin={isSuperAdmin} />}
      </div>
    </div>
  );
}
