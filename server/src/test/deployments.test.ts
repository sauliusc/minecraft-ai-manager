import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    deployment: {
      create:   vi.fn(),
      count:    vi.fn(),
      findMany: vi.fn(),
    },
    activityLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../lib/redis.js', () => ({
  redis: {
    get:   vi.fn().mockResolvedValue(null),
    set:   vi.fn().mockResolvedValue('OK'),
    setex: vi.fn(),
    del:   vi.fn(),
  },
}));

import { prisma } from '../lib/prisma.js';

const BRIDGE_SECRET = 'test-bridge-secret';
const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv, BRIDGE_SECRET };
});

describe('POST /api/deployments', () => {
  it('creates a deployment record with valid service token', async () => {
    const record = { id: 'dep1', imageTag: 'abc1234', triggeredBy: 'sauliusc', action: 'deploy', notes: 'commit msg', createdAt: new Date().toISOString() };
    (prisma.deployment.create as any).mockResolvedValue(record);

    const res = await request(app)
      .post('/api/deployments')
      .set('Authorization', `Bearer ${BRIDGE_SECRET}`)
      .send({ imageTag: 'abc1234', triggeredBy: 'sauliusc', action: 'deploy', notes: 'commit msg' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'dep1', imageTag: 'abc1234', action: 'deploy' });
  });

  it('rejects without service token', async () => {
    const res = await request(app)
      .post('/api/deployments')
      .send({ imageTag: 'abc1234', triggeredBy: 'sauliusc', action: 'deploy' });
    expect(res.status).toBe(403);
  });

  it('rejects invalid action values', async () => {
    const res = await request(app)
      .post('/api/deployments')
      .set('Authorization', `Bearer ${BRIDGE_SECRET}`)
      .send({ imageTag: 'abc1234', triggeredBy: 'sauliusc', action: 'invalid' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/deployments', () => {
  it('returns paginated deployments for authenticated user', async () => {
    (prisma.deployment.count as any).mockResolvedValue(2);
    (prisma.deployment.findMany as any).mockResolvedValue([
      { id: 'dep1', imageTag: 'abc1234', triggeredBy: 'sauliusc', action: 'deploy', notes: null, createdAt: new Date().toISOString() },
      { id: 'dep2', imageTag: 'def5678', triggeredBy: 'sauliusc', action: 'restart', notes: 'manual', createdAt: new Date().toISOString() },
    ]);

    const token = signAccess({ sub: 'u1', email: 'admin@test.com', role: 'SUPER_ADMIN', name: 'Admin', autoConfirm: false });
    const res = await request(app)
      .get('/api/deployments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ total: 2 });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/deployments');
    expect(res.status).toBe(401);
  });
});
