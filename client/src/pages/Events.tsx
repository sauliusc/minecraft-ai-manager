import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface GameEvent {
  id: string;
  type: 'BOSS_RAID' | 'TREASURE_HUNT' | 'BUILD_BATTLE' | 'CLAN_WAR';
  title: string;
  state: 'UPCOMING' | 'ACTIVE' | 'FINISHED';
  scheduledAt: string;
  endedAt: string | null;
  config: Record<string, unknown>;
  participantCount: number;
}

const TYPE_COLORS: Record<string, string> = {
  BOSS_RAID: 'bg-red-100 text-red-700',
  TREASURE_HUNT: 'bg-green-100 text-green-700',
  BUILD_BATTLE: 'bg-blue-100 text-blue-700',
  CLAN_WAR: 'bg-orange-100 text-orange-700',
};

const STATE_BADGE: Record<string, string> = {
  UPCOMING: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  FINISHED: 'bg-gray-100 text-gray-500',
};

function typeLabel(t: string) {
  return t.replace(/_/g, ' ');
}

function ElapsedTimer({ from }: { from: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(from).getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      setElapsed(`${h}h ${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [from]);

  return <span className="text-xs text-green-600 font-mono">{elapsed}</span>;
}

const EMPTY_BOSS: Record<string, string> = {
  bossName: '',
  baseHp: '',
  arenaX: '',
  arenaY: '',
  arenaZ: '',
  phases: '',
  lootTable: '',
};

const EMPTY_TREASURE: Record<string, string> = {
  chestCount: '',
  region: '',
  lootPerChest: '',
  durationMinutes: '',
};

const EMPTY_BUILD: Record<string, string> = {
  theme: '',
  durationMinutes: '',
  plotSize: '',
  judgingMode: 'vote',
};

type EventType = 'BOSS_RAID' | 'TREASURE_HUNT' | 'BUILD_BATTLE' | 'CLAN_WAR';

const DEFAULT_TYPE: EventType = 'BOSS_RAID';

function buildConfig(type: EventType, fields: Record<string, string>): Record<string, unknown> {
  if (type === 'BOSS_RAID') {
    return {
      bossName: fields.bossName,
      baseHp: Number(fields.baseHp),
      arena: { x: Number(fields.arenaX), y: Number(fields.arenaY), z: Number(fields.arenaZ) },
      phases: fields.phases ? JSON.parse(fields.phases) : [],
      lootTable: fields.lootTable ? JSON.parse(fields.lootTable) : [],
    };
  }
  if (type === 'TREASURE_HUNT') {
    return {
      chestCount: Number(fields.chestCount),
      region: fields.region,
      lootPerChest: fields.lootPerChest ? JSON.parse(fields.lootPerChest) : [],
      durationMinutes: Number(fields.durationMinutes),
    };
  }
  if (type === 'BUILD_BATTLE') {
    return {
      theme: fields.theme,
      durationMinutes: Number(fields.durationMinutes),
      plotSize: Number(fields.plotSize),
      judgingMode: fields.judgingMode,
    };
  }
  return {};
}

function BossRaidFields({
  fields,
  onChange,
}: {
  fields: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  const inp = 'w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Boss Name</label>
        <input required value={fields.bossName} onChange={(e) => onChange('bossName', e.target.value)} className={inp} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Base HP</label>
        <input required type="number" min="1" value={fields.baseHp} onChange={(e) => onChange('baseHp', e.target.value)} className={inp} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Arena Coordinates (X / Y / Z)</label>
        <div className="grid grid-cols-3 gap-2">
          <input required type="number" placeholder="X" value={fields.arenaX} onChange={(e) => onChange('arenaX', e.target.value)} className={inp} />
          <input required type="number" placeholder="Y" value={fields.arenaY} onChange={(e) => onChange('arenaY', e.target.value)} className={inp} />
          <input required type="number" placeholder="Z" value={fields.arenaZ} onChange={(e) => onChange('arenaZ', e.target.value)} className={inp} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Phase Config <span className="text-gray-400">(JSON array, optional)</span>
        </label>
        <textarea rows={2} value={fields.phases} onChange={(e) => onChange('phases', e.target.value)} placeholder='[{"threshold":0.5,"ability":"summon_minions"}]' className={`${inp} font-mono`} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Loot Table <span className="text-gray-400">(JSON array, optional)</span>
        </label>
        <textarea rows={2} value={fields.lootTable} onChange={(e) => onChange('lootTable', e.target.value)} placeholder='[{"item":"DIAMOND","weight":10}]' className={`${inp} font-mono`} />
      </div>
    </div>
  );
}

function TreasureHuntFields({
  fields,
  onChange,
}: {
  fields: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  const inp = 'w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Number of Chests</label>
          <input required type="number" min="1" value={fields.chestCount} onChange={(e) => onChange('chestCount', e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Duration (minutes)</label>
          <input required type="number" min="1" value={fields.durationMinutes} onChange={(e) => onChange('durationMinutes', e.target.value)} className={inp} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Scatter Region</label>
        <input required value={fields.region} onChange={(e) => onChange('region', e.target.value)} placeholder="e.g. overworld:0:0:500" className={inp} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Loot Per Chest <span className="text-gray-400">(JSON array, optional)</span>
        </label>
        <textarea rows={2} value={fields.lootPerChest} onChange={(e) => onChange('lootPerChest', e.target.value)} placeholder='[{"item":"GOLD_INGOT","amount":5}]' className={`${inp} font-mono`} />
      </div>
    </div>
  );
}

function BuildBattleFields({
  fields,
  onChange,
}: {
  fields: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  const inp = 'w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Theme</label>
        <input required value={fields.theme} onChange={(e) => onChange('theme', e.target.value)} placeholder="e.g. Medieval Castle" className={inp} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Duration (min)</label>
          <input required type="number" min="1" value={fields.durationMinutes} onChange={(e) => onChange('durationMinutes', e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Plot Size</label>
          <input required type="number" min="1" value={fields.plotSize} onChange={(e) => onChange('plotSize', e.target.value)} placeholder="e.g. 64" className={inp} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Judging Mode</label>
          <select value={fields.judgingMode} onChange={(e) => onChange('judgingMode', e.target.value)} className={inp}>
            <option value="vote">Vote</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>
    </div>
  );
}

const SEVEN_DAYS = 7 * 24 * 3_600_000;

function groupEvents(events: GameEvent[]) {
  const now = Date.now();
  const upcoming = events.filter(
    (e) => e.state === 'UPCOMING' && new Date(e.scheduledAt).getTime() - now <= SEVEN_DAYS,
  );
  const active = events.filter((e) => e.state === 'ACTIVE');
  const past = events.filter((e) => e.state === 'FINISHED');
  return { upcoming, active, past };
}

export function Events() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [tab, setTab] = useState<'all' | 'create'>('all');
  const [stateFilter, setStateFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const [eventType, setEventType] = useState<EventType>(DEFAULT_TYPE);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [bossFields, setBossFields] = useState<Record<string, string>>(EMPTY_BOSS);
  const [treasureFields, setTreasureFields] = useState<Record<string, string>>(EMPTY_TREASURE);
  const [buildFields, setBuildFields] = useState<Record<string, string>>(EMPTY_BUILD);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['events', page, stateFilter, typeFilter],
    queryFn: () =>
      api
        .get('/events', {
          params: {
            page,
            limit: 20,
            state: stateFilter || undefined,
            type: typeFilter || undefined,
          },
        })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const create = useMutation({
    mutationFn: (body: object) => api.post('/events', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      setTab('all');
      setTitle('');
      setScheduledAt('');
      setBossFields(EMPTY_BOSS);
      setTreasureFields(EMPTY_TREASURE);
      setBuildFields(EMPTY_BUILD);
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to create event');
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'end' }) =>
      api.patch(`/events/${id}`, { action }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });

  function fieldChange(
    setter: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  ) {
    return (k: string, v: string) => setter((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    let config: Record<string, unknown>;
    try {
      config = buildConfig(
        eventType,
        eventType === 'BOSS_RAID' ? bossFields : eventType === 'TREASURE_HUNT' ? treasureFields : buildFields,
      );
    } catch {
      setFormError('Phase / loot fields must be valid JSON arrays');
      return;
    }
    create.mutate({
      type: eventType,
      title,
      scheduledAt: new Date(scheduledAt).toISOString(),
      config,
    });
  }

  const events: GameEvent[] = data?.data ?? [];
  const { upcoming, active, past } = groupEvents(events);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Event Command Center</h1>
        {isAdmin && (
          <button
            onClick={() => setTab(tab === 'create' ? 'all' : 'create')}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700"
          >
            {tab === 'create' ? '← Back to Events' : '+ Create Event'}
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['all', 'create'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'all' ? 'All Events' : 'Create Event'}
          </button>
        ))}
      </div>

      {tab === 'create' && isAdmin && (
        <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Event</h2>
          {formError && <p className="text-red-600 text-sm mb-3">{formError}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as EventType)}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="BOSS_RAID">Boss Raid</option>
                  <option value="TREASURE_HUNT">Treasure Hunt</option>
                  <option value="BUILD_BATTLE">Build Battle</option>
                  <option value="CLAN_WAR" disabled>Clan War (read-only)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled At</label>
                <input
                  required
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="border-t pt-4">
              {eventType === 'BOSS_RAID' && (
                <BossRaidFields fields={bossFields} onChange={fieldChange(setBossFields)} />
              )}
              {eventType === 'TREASURE_HUNT' && (
                <TreasureHuntFields fields={treasureFields} onChange={fieldChange(setTreasureFields)} />
              )}
              {eventType === 'BUILD_BATTLE' && (
                <BuildBattleFields fields={buildFields} onChange={fieldChange(setBuildFields)} />
              )}
              {eventType === 'CLAN_WAR' && (
                <p className="text-sm text-gray-500">
                  Clan Wars are created automatically by the server. Use the event list to monitor active wars.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTab('all')}
                className="px-4 py-1.5 text-sm border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending || eventType === 'CLAN_WAR'}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {create.isPending ? 'Creating…' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'all' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex gap-3 flex-wrap">
              <select
                value={stateFilter}
                onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All states</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="ACTIVE">Active</option>
                <option value="FINISHED">Finished</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All types</option>
                <option value="BOSS_RAID">Boss Raid</option>
                <option value="TREASURE_HUNT">Treasure Hunt</option>
                <option value="BUILD_BATTLE">Build Battle</option>
                <option value="CLAN_WAR">Clan War</option>
              </select>
            </div>

            {active.length > 0 && (
              <div className="p-4 border-b">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Live Now</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {active.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => navigate(`/events/${ev.id}`)}
                      className="border-2 border-green-400 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow bg-green-50"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 truncate">{ev.title}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[ev.type]}`}>
                            {typeLabel(ev.type)}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 ml-2 flex-shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                          ACTIVE
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                        <span>{ev.participantCount} participants</span>
                        <ElapsedTimer from={ev.scheduledAt} />
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            actionMutation.mutate({ id: ev.id, action: 'end' });
                          }}
                          className="mt-2 w-full text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                        >
                          End Event
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {upcoming.length > 0 && (
              <div className="p-4 border-b">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Upcoming (next 7 days)</h3>
                <div className="space-y-2">
                  {upcoming.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => navigate(`/events/${ev.id}`)}
                      className="flex items-center justify-between border rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[ev.type]}`}>
                          {typeLabel(ev.type)}
                        </span>
                        <span className="font-medium text-gray-800">{ev.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {new Date(ev.scheduledAt).toLocaleString()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATE_BADGE.UPCOMING}`}>
                          UPCOMING
                        </span>
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              actionMutation.mutate({ id: ev.id, action: 'start' });
                            }}
                            className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Launch Now
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">State</th>
                  <th className="px-4 py-3 text-left">Scheduled</th>
                  <th className="px-4 py-3 text-left">Participants</th>
                  {isAdmin && <th className="px-4 py-3 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                      No events found
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr
                      key={ev.id}
                      onClick={() => navigate(`/events/${ev.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">{ev.title}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[ev.type]}`}>
                          {typeLabel(ev.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATE_BADGE[ev.state]}`}>
                          {ev.state === 'ACTIVE' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                          )}
                          {ev.state}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(ev.scheduledAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{ev.participantCount}</td>
                      {isAdmin && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {ev.state === 'UPCOMING' && (
                            <button
                              onClick={() => actionMutation.mutate({ id: ev.id, action: 'start' })}
                              className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 mr-1"
                            >
                              Launch
                            </button>
                          )}
                          {ev.state === 'ACTIVE' && (
                            <button
                              onClick={() => actionMutation.mutate({ id: ev.id, action: 'end' })}
                              className="text-xs px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                            >
                              End
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {data?.meta && (
              <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
                <span>
                  {data.meta.total === 0
                    ? 'No results'
                    : `Showing ${(page - 1) * 20 + 1}–${Math.min(page * 20, data.meta.total)} of ${data.meta.total}`}
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
      )}
    </div>
  );
}
