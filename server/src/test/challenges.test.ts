import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    challenge: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    challengeProgress: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
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
const modToken = signAccess({ sub: 'user-2', email: 'mod@test.com', role: 'MODERATOR' });

const mockChallenge = {
  id: 'chal-1',
  title: 'Mine 50 Diamonds',
  description: 'Break 50 diamond ore blocks',
  type: 'BLOCK_BREAK',
  config: { target_material: 'DIAMOND_ORE', target_count: 50 },
  rewardId: null,
  activeFrom: new Date(),
  activeUntil: new Date(Date.now() + 86400000),
  assignedTo: [],
};

const mockProgress = {
  id: 'prog-1',
  playerId: 'player-1',
  challengeId: 'chal-1',
  current: 0,
  completed: false,
  completedAt: null,
};

beforeEach(() => {
  process.env.BRIDGE_SECRET = SERVICE_TOKEN;
  vi.clearAllMocks();
  vi.mocked(redis.get).mockResolvedValue(null);
});

describe('GET /api/challenges', () => {
  it('returns paginated list with JWT auth', async () => {
    vi.mocked(prisma.challenge.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.challenge.findMany).mockResolvedValueOnce([mockChallenge] as any);
    const res = await request(app)
      .get('/api/challenges')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/challenges');
    expect(res.status).toBe(401);
  });

  it('filters by status=active', async () => {
    vi.mocked(prisma.challenge.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.challenge.findMany).mockResolvedValueOnce([mockChallenge] as any);
    const res = await request(app)
      .get('/api/challenges?status=active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(prisma.challenge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ activeFrom: expect.anything(), activeUntil: expect.anything() }),
      })
    );
  });

  it('filters by type', async () => {
    vi.mocked(prisma.challenge.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.challenge.findMany).mockResolvedValueOnce([mockChallenge] as any);
    const res = await request(app)
      .get('/api/challenges?type=BLOCK_BREAK')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(prisma.challenge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'BLOCK_BREAK' }),
      })
    );
  });
});

describe('GET /api/challenges/active', () => {
  it('returns active challenges with service token', async () => {
    vi.mocked(prisma.challenge.findMany).mockResolvedValueOnce([mockChallenge] as any);
    const res = await request(app)
      .get('/api/challenges/active')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(vi.mocked(redis.setex)).toHaveBeenCalledWith(
      'challenges:active',
      60,
      expect.any(String)
    );
  });

  it('returns cached result when cache is warm', async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(JSON.stringify([mockChallenge]));
    const res = await request(app)
      .get('/api/challenges/active')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(vi.mocked(prisma.challenge.findMany)).not.toHaveBeenCalled();
  });

  it('returns 403 without service token', async () => {
    const res = await request(app)
      .get('/api/challenges/active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/challenges', () => {
  const validBody = {
    title: 'Mine 50 Diamonds',
    description: 'Break 50 diamond ore blocks',
    type: 'BLOCK_BREAK',
    config: { target_material: 'DIAMOND_ORE', target_count: 50 },
    activeFrom: new Date().toISOString(),
    activeUntil: new Date(Date.now() + 86400000).toISOString(),
  };

  it('creates challenge with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.challenge.create).mockResolvedValueOnce(mockChallenge as any);
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('chal-1');
    expect(vi.mocked(redis.del)).toHaveBeenCalledWith('challenges:active');
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${modToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 for bad body (missing required fields)', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Only title' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/challenges').send(validBody);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/challenges/:id', () => {
  it('returns challenge with progress counts', async () => {
    vi.mocked(prisma.challenge.findUnique).mockResolvedValueOnce({
      ...mockChallenge,
      _count: { progress: 3 },
      progress: [{ completed: true }, { completed: false }, { completed: true }],
    } as any);
    const res = await request(app)
      .get('/api/challenges/chal-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('chal-1');
    expect(res.body.progress.total).toBe(3);
    expect(res.body.progress.completed).toBe(2);
  });

  it('returns 404 for unknown challenge', async () => {
    vi.mocked(prisma.challenge.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/challenges/unknown-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/challenges/chal-1');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/challenges/:id', () => {
  it('updates challenge with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.challenge.update).mockResolvedValueOnce({ ...mockChallenge, title: 'Updated Title' } as any);
    const res = await request(app)
      .patch('/api/challenges/chal-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(vi.mocked(redis.del)).toHaveBeenCalledWith('challenges:active');
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .patch('/api/challenges/chal-1')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown challenge', async () => {
    const err = Object.assign(new Error('Not found'), { code: 'P2025' });
    vi.mocked(prisma.challenge.update).mockRejectedValueOnce(err);
    const res = await request(app)
      .patch('/api/challenges/unknown-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/challenges/:id', () => {
  it('deletes challenge with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValueOnce([undefined, mockChallenge] as any);
    const res = await request(app)
      .delete('/api/challenges/chal-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    expect(vi.mocked(redis.del)).toHaveBeenCalledWith('challenges:active');
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .delete('/api/challenges/chal-1')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/challenges/chal-1');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/challenges/:id/progress', () => {
  it('upserts progress with service token', async () => {
    vi.mocked(prisma.challenge.findUnique).mockResolvedValueOnce(mockChallenge as any);
    vi.mocked(prisma.challengeProgress.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.challengeProgress.upsert).mockResolvedValueOnce({ ...mockProgress, current: 10 } as any);
    const res = await request(app)
      .post('/api/challenges/chal-1/progress')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', amount: 10 });
    expect(res.status).toBe(200);
    expect(res.body.current).toBe(10);
  });

  it('marks completed when current >= target_count', async () => {
    vi.mocked(prisma.challenge.findUnique).mockResolvedValueOnce(mockChallenge as any);
    vi.mocked(prisma.challengeProgress.findUnique).mockResolvedValueOnce({ ...mockProgress, current: 40 } as any);
    vi.mocked(prisma.challengeProgress.upsert).mockResolvedValueOnce({
      ...mockProgress,
      current: 50,
      completed: true,
      completedAt: new Date(),
    } as any);
    const res = await request(app)
      .post('/api/challenges/chal-1/progress')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', amount: 10 });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  it('returns 403 without service token', async () => {
    const res = await request(app)
      .post('/api/challenges/chal-1/progress')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-1', amount: 10 });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown challenge', async () => {
    vi.mocked(prisma.challenge.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/challenges/unknown-id/progress')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', amount: 10 });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid amount', async () => {
    const res = await request(app)
      .post('/api/challenges/chal-1/progress')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', amount: -5 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/challenges/:id/complete', () => {
  it('marks challenge as completed with service token', async () => {
    vi.mocked(prisma.challenge.findUnique).mockResolvedValueOnce(mockChallenge as any);
    vi.mocked(prisma.challengeProgress.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.challengeProgress.upsert).mockResolvedValueOnce({
      ...mockProgress,
      completed: true,
      completedAt: new Date(),
    } as any);
    const res = await request(app)
      .post('/api/challenges/chal-1/complete')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  it('is idempotent — returns 200 with existing when already completed', async () => {
    const completedProgress = { ...mockProgress, completed: true, completedAt: new Date() };
    vi.mocked(prisma.challenge.findUnique).mockResolvedValueOnce(mockChallenge as any);
    vi.mocked(prisma.challengeProgress.findUnique).mockResolvedValueOnce(completedProgress as any);
    const res = await request(app)
      .post('/api/challenges/chal-1/complete')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(vi.mocked(prisma.challengeProgress.upsert)).not.toHaveBeenCalled();
  });

  it('returns 403 without service token', async () => {
    const res = await request(app)
      .post('/api/challenges/chal-1/complete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown challenge', async () => {
    vi.mocked(prisma.challenge.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/challenges/unknown-id/complete')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(404);
  });
});
