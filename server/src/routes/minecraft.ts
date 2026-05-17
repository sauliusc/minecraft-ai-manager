import { Router, Request, Response } from 'express';
import Dockerode from 'dockerode';
import { Rcon } from 'rcon-client';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authMiddleware);

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

const RCON_HOST = process.env.MINECRAFT_HOST ?? 'minecraft';
const RCON_PORT = parseInt(process.env.RCON_PORT ?? '25575');
const RCON_PASSWORD = process.env.RCON_PASSWORD ?? '';

async function withRcon<T>(fn: (rcon: Rcon) => Promise<T>): Promise<T> {
  const rcon = new Rcon({ host: RCON_HOST, port: RCON_PORT, password: RCON_PASSWORD, timeout: 5000 });
  await rcon.connect();
  try {
    return await fn(rcon);
  } finally {
    await rcon.end();
  }
}

async function getMinecraftContainer() {
  const all = await docker.listContainers({ all: true });
  return all.find((c) => c.Labels['com.docker.compose.service'] === 'minecraft') ?? null;
}

// Strip ANSI color codes from Minecraft log output
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '').replace(/§[0-9a-fk-or]/gi, '');
}

// Decode Docker multiplexed log stream (non-TTY containers)
function decodeDockerLogs(buf: Buffer): string[] {
  const lines: string[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset + 4);
    if (size === 0) { offset += 8; continue; }
    const chunk = buf.slice(offset + 8, offset + 8 + size).toString('utf8');
    for (const line of chunk.split('\n')) {
      const clean = stripAnsi(line).trimEnd();
      if (clean) lines.push(clean);
    }
    offset += 8 + size;
  }
  return lines;
}

// ── GET /api/minecraft/status ─────────────────────────────────────────────────
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const info = await getMinecraftContainer();
    if (!info) {
      res.json({ state: 'not_found', players: [], playerCount: 0, tps: null, uptime: null });
      return;
    }

    if (info.State !== 'running') {
      res.json({ state: info.State, players: [], playerCount: 0, tps: null, uptime: info.Status });
      return;
    }

    let players: string[] = [];
    let tps: number[] | null = null;
    let rconReady = false;

    try {
      const [listOut, tpsOut] = await withRcon(async (rcon) => {
        return Promise.all([rcon.send('list'), rcon.send('tps')]);
      });
      rconReady = true;

      // "There are 3 of a max of 20 players online: Alice, Bob, Charlie"
      const pm = listOut.match(/There are (\d+) of a max.*?online: ?(.*)/);
      if (pm) players = pm[2] ? pm[2].split(', ').filter(Boolean) : [];

      // Paper: "TPS from last 1m, 5m, 15m: ◆ 20.0, ◆ 19.8, ◆ 19.9"
      const tm = tpsOut.match(/([\d.]+)[^\d]+([\d.]+)[^\d]+([\d.]+)/);
      if (tm) tps = [parseFloat(tm[1]), parseFloat(tm[2]), parseFloat(tm[3])];
    } catch {
      // RCON not ready — server still starting up
    }

    res.json({
      state: rconReady ? 'running' : 'starting',
      players,
      playerCount: players.length,
      tps,
      uptime: info.Status,
      containerId: info.Id.slice(0, 12),
    });
  } catch (err) {
    res.status(500).json({ error: 'DOCKER_ERROR', message: String(err) });
  }
});

// ── GET /api/minecraft/logs ───────────────────────────────────────────────────
router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const info = await getMinecraftContainer();
    if (!info) {
      res.json({ lines: [] });
      return;
    }

    const tail = Math.min(parseInt(String(req.query.tail ?? '150')), 500);
    const container = docker.getContainer(info.Id);
    const buf = (await container.logs({ stdout: true, stderr: true, tail, timestamps: false })) as Buffer;
    res.json({ lines: decodeDockerLogs(buf) });
  } catch (err) {
    res.status(500).json({ error: 'DOCKER_ERROR', message: String(err) });
  }
});

// ── POST /api/minecraft/command ───────────────────────────────────────────────
router.post('/command', async (req: Request, res: Response): Promise<void> => {
  const { command } = req.body as { command?: string };
  if (!command?.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'command is required' });
    return;
  }
  try {
    const output = await withRcon((rcon) => rcon.send(command.trim()));
    res.json({ output: stripAnsi(output) });
  } catch {
    res.status(503).json({ error: 'RCON_UNAVAILABLE', message: 'Server is not accepting commands right now' });
  }
});

// ── POST /api/minecraft/power ─────────────────────────────────────────────────
router.post('/power', async (req: Request, res: Response): Promise<void> => {
  const { action } = req.body as { action?: string };
  if (!action || !['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'action must be start | stop | restart' });
    return;
  }

  const user = (req as Request & { user: { role: string } }).user;
  if (user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Power control requires SUPER_ADMIN' });
    return;
  }

  try {
    const info = await getMinecraftContainer();
    if (!info) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Minecraft container not found' });
      return;
    }
    const container = docker.getContainer(info.Id);
    if (action === 'start') await container.start();
    else if (action === 'stop') await container.stop({ t: 10 });
    else await container.restart({ t: 10 });

    res.json({ ok: true, action });
  } catch (err) {
    res.status(500).json({ error: 'DOCKER_ERROR', message: String(err) });
  }
});

export { router as minecraftRouter };
