import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
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
const adminToken = signAccess({ sub: 'user-1', email: 'admin@test.com', role: 'SUPER_ADMIN' });

const mockPlayer = {
  id: '550e8400-e29b-41d4-a716-446655440000',
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
      .send({ id: mockPlayer.id, username: 'TestPlayer' });
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('Regular');
  });

  it('returns 403 without service token', async () => {
    const res = await request(app)
      .post('/api/players')
      .send({ id: mockPlayer.id, username: 'TestPlayer' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ id: 'not-a-uuid', username: 'TestPlayer' });
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

describe('GET /api/players/:id', () => {
  it('returns player detail from DB when cache is cold', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ ...mockPlayer, progress: [], rewards: [] } as any);
    const res = await request(app)
      .get(`/api/players/${mockPlayer.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('TestPlayer');
    expect(vi.mocked(redis.setex)).toHaveBeenCalled();
  });

  it('returns cached result when cache is warm', async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(JSON.stringify({ ...mockPlayer, tier: 'Regular', progress: [], rewards: [] }));
    const res = await request(app)
      .get(`/api/players/${mockPlayer.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.player.findUnique)).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown player', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/players/00000000-0000-0000-0000-000000000000')
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
      .send({ id: mockPlayer.id, username: 'TestPlayer' });
    expect(res.body.tier).toBe(expectedTier);
  });
});
