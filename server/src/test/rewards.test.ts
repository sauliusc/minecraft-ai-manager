import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    reward: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    playerReward: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    challenge: {
      findFirst: vi.fn(),
    },
    activityLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn(),
    del: vi.fn(),
  },
}));

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

const SERVICE_TOKEN = 'test-bridge-secret';
const adminToken = signAccess({ sub: 'user-1', email: 'admin@test.com', role: 'SUPER_ADMIN', name: '', autoConfirm: true });
const modToken = signAccess({ sub: 'user-2', email: 'mod@test.com', role: 'MODERATOR', name: '', autoConfirm: false });

const mockReward = {
  id: 'reward-1',
  name: 'Diamond Sword',
  type: 'ITEM',
  config: { item: 'DIAMOND_SWORD', amount: 1 },
  rarity: 'RARE',
};

const mockPlayerReward = {
  id: 'grant-1',
  playerId: 'player-1',
  rewardId: 'reward-1',
  grantedAt: new Date(),
  grantedBy: 'user-1',
  reward: mockReward,
};

beforeEach(() => {
  process.env.BRIDGE_SECRET = SERVICE_TOKEN;
  vi.clearAllMocks();
  vi.mocked(redis.get).mockResolvedValue(null);
  vi.mocked(redis.set).mockResolvedValue('OK' as any);
});

describe('GET /api/rewards', () => {
  it('returns paginated list with JWT auth', async () => {
    vi.mocked(prisma.reward.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.reward.findMany).mockResolvedValueOnce([mockReward] as any);
    const res = await request(app)
      .get('/api/rewards')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/rewards');
    expect(res.status).toBe(401);
  });

  it('filters by type', async () => {
    vi.mocked(prisma.reward.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.reward.findMany).mockResolvedValueOnce([mockReward] as any);
    const res = await request(app)
      .get('/api/rewards?type=ITEM')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(prisma.reward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'ITEM' }),
      })
    );
  });
});

describe('POST /api/rewards', () => {
  const validBody = {
    name: 'Diamond Sword',
    type: 'ITEM',
    config: { item: 'DIAMOND_SWORD', amount: 1 },
    rarity: 'RARE',
  };

  it('creates reward with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.reward.create).mockResolvedValueOnce(mockReward as any);
    const res = await request(app)
      .post('/api/rewards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('reward-1');
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .post('/api/rewards')
      .set('Authorization', `Bearer ${modToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 for bad body (missing required fields)', async () => {
    const res = await request(app)
      .post('/api/rewards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Only name' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/rewards').send(validBody);
    expect(res.status).toBe(401);
  });

  it('rejects MYSTERY_BOX with weights not summing to 100', async () => {
    const res = await request(app)
      .post('/api/rewards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Mystery Box',
        type: 'MYSTERY_BOX',
        config: {},
        lootTable: [
          { rewardId: 'reward-1', weight: 60 },
          { rewardId: 'reward-2', weight: 20 }, // total 80, not 100
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/100/);
  });

  it('accepts MYSTERY_BOX with weights summing to 100', async () => {
    const mbReward = { ...mockReward, type: 'MYSTERY_BOX', lootTable: [{ rewardId: 'reward-1', weight: 100 }] };
    vi.mocked(prisma.reward.create).mockResolvedValueOnce(mbReward as any);
    const res = await request(app)
      .post('/api/rewards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Mystery Box',
        type: 'MYSTERY_BOX',
        config: {},
        lootTable: [{ rewardId: 'reward-1', weight: 100 }],
      });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/rewards/:id', () => {
  it('returns reward with grant count', async () => {
    vi.mocked(prisma.reward.findUnique).mockResolvedValueOnce({
      ...mockReward,
      _count: { grants: 5 },
    } as any);
    const res = await request(app)
      .get('/api/rewards/reward-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('reward-1');
    expect(res.body.grantCount).toBe(5);
  });

  it('returns 404 for unknown reward', async () => {
    vi.mocked(prisma.reward.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/rewards/unknown-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/rewards/reward-1');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/rewards/:id', () => {
  it('updates reward with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.reward.update).mockResolvedValueOnce({ ...mockReward, name: 'Updated Sword' } as any);
    const res = await request(app)
      .patch('/api/rewards/reward-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Sword' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Sword');
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .patch('/api/rewards/reward-1')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ name: 'Updated Sword' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown reward', async () => {
    const err = Object.assign(new Error('Not found'), { code: 'P2025' });
    vi.mocked(prisma.reward.update).mockRejectedValueOnce(err);
    const res = await request(app)
      .patch('/api/rewards/unknown-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Sword' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/rewards/:id', () => {
  it('deletes reward with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.challenge.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.reward.delete).mockResolvedValueOnce(mockReward as any);
    const res = await request(app)
      .delete('/api/rewards/reward-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });

  it('returns 409 if reward linked to active challenge', async () => {
    vi.mocked(prisma.challenge.findFirst).mockResolvedValueOnce({
      id: 'chal-1',
      rewardId: 'reward-1',
      activeUntil: new Date(Date.now() + 86400000),
    } as any);
    const res = await request(app)
      .delete('/api/rewards/reward-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .delete('/api/rewards/reward-1')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/rewards/reward-1');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/rewards/pending/:playerId', () => {
  it('returns pending rewards for player with service token', async () => {
    vi.mocked(prisma.playerReward.findMany).mockResolvedValueOnce([mockPlayerReward] as any);
    const res = await request(app)
      .get('/api/rewards/pending/player-1')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('grant-1');
    expect(res.body[0].rewardId).toBe('reward-1');
    expect(res.body[0].rewardName).toBe('Diamond Sword');
    expect(res.body[0].rewardType).toBe('ITEM');
  });

  it('returns 403 without service token', async () => {
    const res = await request(app)
      .get('/api/rewards/pending/player-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/rewards/grant', () => {
  const validBody = {
    playerId: 'player-1',
    rewardId: 'reward-1',
    reason: 'Won tournament',
  };

  it('grants reward with JWT auth (bridge may fail, returns queued:true)', async () => {
    vi.mocked(prisma.reward.findUnique).mockResolvedValueOnce(mockReward as any);
    vi.mocked(redis.set).mockResolvedValueOnce('OK' as any);
    vi.mocked(prisma.playerReward.create).mockResolvedValueOnce(mockPlayerReward as any);
    const res = await request(app)
      .post('/api/rewards/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.grantId).toBe('grant-1');
    // Bridge URL not set in test env, so queued = true
    expect(res.body.queued).toBe(true);
  });

  it('returns 409 when Redis lock is already held', async () => {
    vi.mocked(prisma.reward.findUnique).mockResolvedValueOnce(mockReward as any);
    vi.mocked(redis.set).mockResolvedValueOnce(null as any);
    const res = await request(app)
      .post('/api/rewards/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('returns 404 if reward not found', async () => {
    vi.mocked(prisma.reward.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/rewards/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/rewards/grant')
      .send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .post('/api/rewards/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-1' }); // missing rewardId
    expect(res.status).toBe(400);
  });
});
