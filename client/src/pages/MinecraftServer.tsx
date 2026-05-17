import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface ServerStatus {
  state: 'running' | 'starting' | 'exited' | 'not_found' | string;
  players: string[];
  playerCount: number;
  tps: [number, number, number] | null;
  uptime: string | null;
  containerId?: string;
}

interface LogsResponse {
  lines: string[];
}

function tpsColor(tps: number): string {
  if (tps >= 19) return 'text-green-400';
  if (tps >= 15) return 'text-yellow-400';
  return 'text-red-400';
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    running:   'bg-green-100 text-green-700',
    starting:  'bg-yellow-100 text-yellow-700',
    exited:    'bg-gray-100 text-gray-500',
    not_found: 'bg-gray-100 text-gray-500',
  };
  const cls = map[state] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${cls}`}>
      {state.replace('_', ' ')}
    </span>
  );
}

function logLineColor(line: string): string {
  if (line.includes('ERROR') || line.includes('SEVERE')) return 'text-red-400';
  if (line.includes('WARN')) return 'text-yellow-400';
  if (line.includes('INFO')) return 'text-gray-300';
  return 'text-gray-400';
}

export function MinecraftServer() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();

  const [command, setCommand] = useState('');
  const [commandLog, setCommandLog] = useState<{ cmd: string; out: string }[]>([]);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart' | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const { data: status, isLoading: statusLoading } = useQuery<ServerStatus>({
    queryKey: ['mc-status'],
    queryFn: () => api.get('/minecraft/status').then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: logs } = useQuery<LogsResponse>({
    queryKey: ['mc-logs'],
    queryFn: () => api.get('/minecraft/logs?tail=150').then((r) => r.data),
    refetchInterval: 5000,
    enabled: status?.state === 'running' || status?.state === 'starting',
  });

  // Auto-scroll console to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs?.lines]);

  const powerMutation = useMutation({
    mutationFn: (action: string) => api.post('/minecraft/power', { action }),
    onSuccess: () => {
      setConfirmAction(null);
      setTimeout(() => qc.invalidateQueries({ queryKey: ['mc-status'] }), 1500);
    },
  });

  const commandMutation = useMutation({
    mutationFn: (cmd: string) => api.post('/minecraft/command', { command: cmd }),
    onSuccess: (res, cmd) => {
      setCommandLog((prev) => [...prev.slice(-49), { cmd, out: res.data.output ?? '' }]);
      setCommand('');
    },
    onError: (_err, cmd) => {
      setCommandLog((prev) => [...prev.slice(-49), { cmd, out: '✗ Server not accepting commands' }]);
      setCommand('');
    },
  });

  const sendCommand = () => {
    const cmd = command.trim();
    if (!cmd) return;
    commandMutation.mutate(cmd);
  };

  const online = status?.state === 'running';
  const serverUnavailable = !online;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Minecraft Server</h1>

      {/* ── Status card ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow p-5 flex flex-wrap gap-8 items-center">
        {statusLoading ? (
          <span className="text-gray-400 text-sm">Loading…</span>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <StateBadge state={status?.state ?? 'unknown'} />
            </div>

            <div className="text-sm">
              <span className="text-gray-500">Players</span>
              <span className="ml-2 font-semibold text-gray-800">{status?.playerCount ?? 0}</span>
            </div>

            {status?.tps && (
              <div className="text-sm font-mono">
                <span className="text-gray-500 mr-2">TPS</span>
                {status.tps.map((t, i) => (
                  <span key={i} className={`mr-3 font-semibold ${tpsColor(t)}`}>
                    {t.toFixed(1)}{i < 2 ? '' : ''}
                  </span>
                ))}
                <span className="text-gray-400 text-xs">(1m / 5m / 15m)</span>
              </div>
            )}

            {status?.uptime && (
              <div className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">{status.uptime}</span>
              </div>
            )}

            {status?.containerId && (
              <div className="text-xs text-gray-400 font-mono">{status.containerId}</div>
            )}
          </>
        )}

        {/* Power controls */}
        {isSuperAdmin && (
          <div className="ml-auto flex gap-2">
            {confirmAction ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {confirmAction === 'stop' ? 'Stop server?' : 'Restart server?'}
                </span>
                <button
                  onClick={() => powerMutation.mutate(confirmAction)}
                  disabled={powerMutation.isPending}
                  className="px-3 py-1.5 rounded text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-3 py-1.5 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => powerMutation.mutate('start')}
                  disabled={online || powerMutation.isPending}
                  className="px-3 py-1.5 rounded text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Start
                </button>
                <button
                  onClick={() => setConfirmAction('restart')}
                  disabled={serverUnavailable || powerMutation.isPending}
                  className="px-3 py-1.5 rounded text-sm bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
                >
                  Restart
                </button>
                <button
                  onClick={() => setConfirmAction('stop')}
                  disabled={serverUnavailable || powerMutation.isPending}
                  className="px-3 py-1.5 rounded text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Stop
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Online players ────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Online Players ({status?.playerCount ?? 0})
          </h2>
          {status?.players.length ? (
            <ul className="space-y-1">
              {status.players.map((name) => (
                <li key={name} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">{online ? 'No players online' : '—'}</p>
          )}
        </div>

        {/* ── Console ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-gray-900 rounded-lg shadow flex flex-col" style={{ minHeight: '420px' }}>
          <div className="px-4 py-2 border-b border-gray-700 text-xs text-gray-400 font-semibold tracking-wide uppercase">
            Console
          </div>

          {/* Log output */}
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs space-y-0.5"
            style={{ maxHeight: '340px' }}
          >
            {logs?.lines.map((line, i) => (
              <div key={i} className={logLineColor(line)}>
                {line}
              </div>
            ))}
            {/* Command history entries */}
            {commandLog.map((entry, i) => (
              <div key={`cmd-${i}`}>
                <div className="text-cyan-400">{'> '}{entry.cmd}</div>
                {entry.out && <div className="text-gray-300">{entry.out}</div>}
              </div>
            ))}
            {!logs?.lines.length && !commandLog.length && (
              <div className="text-gray-600">{online ? 'Waiting for log output…' : 'Server is offline'}</div>
            )}
          </div>

          {/* Command input */}
          <div className="px-4 py-3 border-t border-gray-700 flex gap-2">
            <span className="text-cyan-400 font-mono text-sm self-center">{'>'}</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendCommand(); }}
              placeholder={online ? 'Enter command…' : 'Server offline'}
              disabled={!online || commandMutation.isPending}
              className="flex-1 bg-transparent text-gray-100 font-mono text-sm outline-none placeholder-gray-600 disabled:opacity-40"
            />
            <button
              onClick={sendCommand}
              disabled={!online || !command.trim() || commandMutation.isPending}
              className="px-3 py-1 rounded text-xs bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
