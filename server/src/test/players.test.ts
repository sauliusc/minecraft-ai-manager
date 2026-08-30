import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    challengeProgress: { count: vi.fn() },
    playerReward: { count: vi.fn() },
    economyAuditLog: { aggregate: vi.fn() },
    clanMember: { findFirst: vi.fn() },
    player: {
      upsert: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  },
}));

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

const SERVICE_TOKEN = 'test-bridge-secret';
const adminToken = signAccess({ sub: 'user-1', email: 'admin@test.com', role: 'SUPER_ADMIN', name: '', autoConfirm: true });

const mockPlayer = {
  username: 'TestPlayer',
  firstJoinAt: new Date(),
  lastSeenAt: new Date(),
  joinCount: 5,
};

beforeEach(() => {
  process.env.BRIDGE_SECRET = SERVICE_TOKEN;
  vi.clearAllMocks();
  vi.mocked(redis.get).mockResolvedValue(null);
});

describe('POST /api/players', () => {
  it('registers new player with service token', async () => {
    vi.mocked(prisma.player.upsert).mockResolvedValueOnce(mockPlayer as any);
    const res = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ username: 'TestPlayer' });
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('Regular');
  });

  it('returns 403 without service token', async () => {
    const res = await request(app)
      .post('/api/players')
      .send({ username: 'TestPlayer' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing username', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/players', () => {
  it('returns paginated list with JWT auth', async () => {
    vi.mocked(prisma.player.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([mockPlayer] as any);
    const res = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/players');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/players/:username', () => {
  it('returns player detail from DB when cache is cold', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ ...mockPlayer, progress: [], rewards: [] } as any);
    const res = await request(app)
      .get(`/api/players/${mockPlayer.username}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('TestPlayer');
    expect(vi.mocked(redis.setex)).toHaveBeenCalled();
  });

  it('returns cached result when cache is warm', async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(JSON.stringify({ ...mockPlayer, tier: 'Regular', progress: [], rewards: [] }));
    const res = await request(app)
      .get(`/api/players/${mockPlayer.username}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.player.findUnique)).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown player', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/players/UnknownPlayer')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Engagement tier calculation', () => {
  it.each([
    [0, 'New'], [4, 'New'], [5, 'Regular'], [29, 'Regular'],
    [30, 'Veteran'], [99, 'Veteran'], [100, 'Legend'], [999, 'Legend'],
  ])('joinCount %i → tier %s', async (joinCount, expectedTier) => {
    vi.mocked(prisma.player.upsert).mockResolvedValueOnce({ ...mockPlayer, joinCount } as any);
    const res = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ username: 'TestPlayer' });
    expect(res.body.tier).toBe(expectedTier);
  });
});

describe('GET /api/players/:username/stats', () => {
  const SERVICE = 'test-bridge-secret';

  beforeEach(() => {
    process.env.BRIDGE_SECRET = SERVICE;
    (prisma.challengeProgress.count as any).mockResolvedValue(3);
    (prisma.playerReward.count as any).mockResolvedValue(7);
    (prisma.economyAuditLog.aggregate as any).mockResolvedValue({ _sum: { delta: -240 } });
    (prisma.clanMember.findFirst as any).mockResolvedValue(null);
  });

  it('returns the CraftControl half of the stats panel', async () => {
    (prisma.player.findUnique as any).mockResolvedValue({
      username: 'ADASGAME', coins: 150, crystals: 0, joinCount: 56,
      currentStreak: 2, longestStreak: 9, firstJoinAt: new Date('2026-08-19T06:33:24Z'),
    });

    const res = await request(app)
      .get('/api/players/ADASGAME/stats')
      .set('Authorization', `Bearer ${SERVICE}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      username: 'ADASGAME', coins: 150, joinCount: 56,
      currentStreak: 2, longestStreak: 9,
      challengesCompleted: 3, rewardsEarned: 7,
    });
  });

  it('reports shop spending as a positive number', async () => {
    // Purchases are stored as negative deltas; "spent 240" reads better than -240.
    (prisma.player.findUnique as any).mockResolvedValue({
      username: 'ADASGAME', coins: 150, crystals: 0, joinCount: 1,
      currentStreak: 1, longestStreak: 1, firstJoinAt: new Date(),
    });

    const res = await request(app)
      .get('/api/players/ADASGAME/stats')
      .set('Authorization', `Bearer ${SERVICE}`);

    expect(res.body.coinsSpentInShop).toBe(240);
  });

  it('reports zero rather than null when nothing has been spent', async () => {
    (prisma.economyAuditLog.aggregate as any).mockResolvedValue({ _sum: { delta: null } });
    (prisma.player.findUnique as any).mockResolvedValue({
      username: 'new', coins: 50, crystals: 0, joinCount: 1,
      currentStreak: 1, longestStreak: 1, firstJoinAt: new Date(),
    });

    const res = await request(app)
      .get('/api/players/new/stats')
      .set('Authorization', `Bearer ${SERVICE}`);

    expect(res.body.coinsSpentInShop).toBe(0);
  });

  it('includes the clan when the player is in one', async () => {
    (prisma.player.findUnique as any).mockResolvedValue({
      username: 'ADASGAME', coins: 150, crystals: 0, joinCount: 1,
      currentStreak: 1, longestStreak: 1, firstJoinAt: new Date(),
    });
    (prisma.clanMember.findFirst as any).mockResolvedValue({
      clan: { name: 'Builders', tag: 'BLD', level: 2 },
    });

    const res = await request(app)
      .get('/api/players/ADASGAME/stats')
      .set('Authorization', `Bearer ${SERVICE}`);

    expect(res.body.clan).toEqual({ name: 'Builders', tag: 'BLD', level: 2 });
  });

  it('404s for a player who has never joined', async () => {
    (prisma.player.findUnique as any).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/players/ghost/stats')
      .set('Authorization', `Bearer ${SERVICE}`);

    expect(res.status).toBe(404);
  });

  it('is not readable without a service token', async () => {
    expect((await request(app).get('/api/players/ADASGAME/stats')).status).toBe(403);
  });
});

describe('GET /api/players/:username/minecraft-stats', () => {
  const adminJwt = signAccess({ sub: 'a', email: 'a@t.com', role: 'SUPER_ADMIN', name: '', autoConfirm: true });
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.MINECRAFT_BRIDGE_URL = 'http://minecraft:25580';
    process.env.BRIDGE_SECRET = 'test-bridge-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('passes the game server statistics through', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'ADASGAME', playTicks: 1_270_000, blocksMined: 4127 }),
    }) as any;

    const res = await request(app)
      .get('/api/players/ADASGAME/minecraft-stats')
      .set('Authorization', `Bearer ${adminJwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: true, stats: { blocksMined: 4127 } });
  });

  it('reports unavailable rather than failing when the server is down', async () => {
    // The rest of the player page must still render.
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const res = await request(app)
      .get('/api/players/ADASGAME/minecraft-stats')
      .set('Authorization', `Bearer ${adminJwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, stats: null });
  });

  it('reports unavailable when the server is too busy to answer', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;

    const res = await request(app)
      .get('/api/players/ADASGAME/minecraft-stats')
      .set('Authorization', `Bearer ${adminJwt}`);

    expect(res.body).toEqual({ available: false, stats: null });
  });

  it('url-encodes the player name it asks for', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;

    await request(app)
      .get('/api/players/odd%20name/minecraft-stats')
      .set('Authorization', `Bearer ${adminJwt}`);

    expect(fetchMock.mock.calls[0][0]).toContain('player=odd%20name');
  });

  it('requires a logged-in user', async () => {
    expect((await request(app).get('/api/players/ADASGAME/minecraft-stats')).status).toBe(401);
  });
});
