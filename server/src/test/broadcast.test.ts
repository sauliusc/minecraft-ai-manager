import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    broadcastMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    broadcastTrigger: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    activityLog: {
      create: vi.fn().mockResolvedValue({}),
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

// Immediate sends go out over RCON; the live server is not available under test.
vi.mock('../lib/rcon.js', () => ({
  withRcon: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../lib/prisma.js';

const adminToken = signAccess({ sub: 'admin-1', email: 'admin@test.com', role: 'SUPER_ADMIN', name: '', autoConfirm: true });

const mockMessage = {
  id: 'msg-1',
  content: 'Hello server',
  channels: ['CHAT'],
  audience: 'ALL',
  scheduledAt: null,
  status: 'SENT',
  sentAt: new Date(),
  createdBy: 'admin-1',
};

describe('POST /api/broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.broadcastMessage.create as any).mockResolvedValue(mockMessage);
  });

  it('accepts a message at the 500-character limit', async () => {
    const res = await request(app)
      .post('/api/broadcast')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: 'a'.repeat(500), channels: ['CHAT'] });

    expect(res.status).toBe(201);
    expect(prisma.broadcastMessage.create).toHaveBeenCalled();
  });

  it('rejects a message over 500 characters', async () => {
    // The dashboard caps the textarea at 500; without a server-side max any other
    // API client could push an unbounded string straight into `say`.
    const res = await request(app)
      .post('/api/broadcast')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: 'a'.repeat(501), channels: ['CHAT'] });

    expect(res.status).toBe(400);
    expect(prisma.broadcastMessage.create).not.toHaveBeenCalled();
  });

  it('rejects an empty message', async () => {
    const res = await request(app)
      .post('/api/broadcast')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: '', channels: ['CHAT'] });

    expect(res.status).toBe(400);
  });

  it('rejects an over-long message on update too', async () => {
    const res = await request(app)
      .patch('/api/broadcast/scheduled/msg-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: 'a'.repeat(501) });

    expect(res.status).toBe(400);
    expect(prisma.broadcastMessage.update).not.toHaveBeenCalled();
  });
});
