import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    moderationReport: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    moderationAction: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    chatLog: {
      count: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    playerBlock: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
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

import { prisma } from '../lib/prisma.js';

const SERVICE_TOKEN = 'test-bridge-secret';
const adminToken = signAccess({ sub: 'user-admin', email: 'admin@test.com', role: 'SUPER_ADMIN', name: '', autoConfirm: true });
const modToken = signAccess({ sub: 'user-mod', email: 'mod@test.com', role: 'MODERATOR', name: '', autoConfirm: false });
const playerToken = signAccess({ sub: 'user-player', email: 'player@test.com', role: 'PLAYER', name: '', autoConfirm: false });

const mockReport = {
  id: 'report-1',
  reporterId: 'player-1',
  reportedId: 'player-2',
  reason: 'Spamming chat',
  chatSnapshot: ['hello', 'hello', 'hello'],
  status: 'PENDING',
  escalated: false,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: new Date().toISOString(),
};

const mockAction = {
  id: 'action-1',
  targetId: 'player-2',
  adminId: 'user-admin',
  type: 'MUTE',
  reason: 'Excessive spamming',
  expiresAt: null,
  createdAt: new Date().toISOString(),
};

const mockChatLog = {
  id: 'chat-1',
  playerId: 'player-1',
  username: 'Notch',
  message: 'Hello world',
  flagged: false,
  createdAt: new Date().toISOString(),
};

const mockBlock = {
  id: 'block-1',
  blockerId: 'player-1',
  blockedId: 'player-2',
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  process.env.BRIDGE_SECRET = SERVICE_TOKEN;
  vi.clearAllMocks();
});

// ── GET /api/moderation/reports ───────────────────────────────────────────────

describe('GET /api/moderation/reports', () => {
  it('returns paginated list with JWT auth', async () => {
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.moderationReport.findMany).mockResolvedValueOnce([mockReport] as any);

    const res = await request(app)
      .get('/api/moderation/reports')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.meta.page).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/moderation/reports');
    expect(res.status).toBe(401);
  });

  it('filters by ?status=ESCALATED', async () => {
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(2);
    vi.mocked(prisma.moderationReport.findMany).mockResolvedValueOnce([
      { ...mockReport, status: 'ESCALATED', escalated: true },
      { ...mockReport, id: 'report-2', status: 'ESCALATED', escalated: true },
    ] as any);

    const res = await request(app)
      .get('/api/moderation/reports?status=ESCALATED')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(prisma.moderationReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ESCALATED' }),
      })
    );
  });

  it('filters by ?status=PENDING', async () => {
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.moderationReport.findMany).mockResolvedValueOnce([mockReport] as any);

    const res = await request(app)
      .get('/api/moderation/reports?status=PENDING')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(prisma.moderationReport.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) })
    );
  });

  it('filters by ?reporterId', async () => {
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.moderationReport.findMany).mockResolvedValueOnce([mockReport] as any);

    const res = await request(app)
      .get('/api/moderation/reports?reporterId=player-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(prisma.moderationReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reporterId: 'player-1' }),
      })
    );
  });

  it('respects custom page and limit', async () => {
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(100);
    vi.mocked(prisma.moderationReport.findMany).mockResolvedValueOnce([mockReport] as any);

    const res = await request(app)
      .get('/api/moderation/reports?page=3&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(prisma.moderationReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it('works with PLAYER role JWT', async () => {
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.moderationReport.findMany).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/moderation/reports')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(res.status).toBe(200);
  });
});

// ── GET /api/moderation/reports/resolved/:reporterId ─────────────────────────

describe('GET /api/moderation/reports/resolved/:reporterId', () => {
  it('returns resolved reports with service token', async () => {
    vi.mocked(prisma.moderationReport.findMany).mockResolvedValueOnce([
      { id: 'report-1', reason: 'Spamming', resolvedAt: new Date().toISOString() },
    ] as any);

    const res = await request(app)
      .get('/api/moderation/reports/resolved/player-1')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prisma.moderationReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reporterId: 'player-1', status: 'RESOLVED' }),
        take: 10,
      })
    );
  });

  it('returns 403 with JWT instead of service token', async () => {
    const res = await request(app)
      .get('/api/moderation/reports/resolved/player-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 without any token', async () => {
    const res = await request(app).get('/api/moderation/reports/resolved/player-1');
    expect(res.status).toBe(403);
  });

  it('applies ?since filter when provided', async () => {
    vi.mocked(prisma.moderationReport.findMany).mockResolvedValueOnce([]);

    const since = '2024-01-01T00:00:00.000Z';
    const res = await request(app)
      .get(`/api/moderation/reports/resolved/player-1?since=${since}`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(prisma.moderationReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resolvedAt: { gte: new Date(since) },
        }),
      })
    );
  });
});

// ── POST /api/moderation/reports ─────────────────────────────────────────────

describe('POST /api/moderation/reports', () => {
  const validBody = {
    reporterId: 'player-1',
    reportedId: 'player-2',
    reason: 'Spamming chat',
    chatSnapshot: ['hello', 'hello', 'hello'],
  };

  it('creates a report with service token', async () => {
    vi.mocked(prisma.moderationReport.create).mockResolvedValueOnce(mockReport as any);
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(1); // below threshold

    const res = await request(app)
      .post('/api/moderation/reports')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('report-1');
    expect(prisma.moderationReport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportedId: 'player-2' }) })
    );
  });

  it('returns 403 with JWT token instead of service token', async () => {
    const res = await request(app)
      .post('/api/moderation/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('returns 403 without any token', async () => {
    const res = await request(app)
      .post('/api/moderation/reports')
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/moderation/reports')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ reason: 'Only reason' });

    expect(res.status).toBe(400);
  });

  it('auto-escalates when recent report count >= 3', async () => {
    vi.mocked(prisma.moderationReport.create).mockResolvedValueOnce(mockReport as any);
    // count returns 3 — triggers escalation
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(3);
    vi.mocked(prisma.moderationReport.updateMany).mockResolvedValueOnce({ count: 2 } as any);

    const res = await request(app)
      .post('/api/moderation/reports')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(prisma.moderationReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reportedId: 'player-2', status: 'PENDING' }),
        data: { status: 'ESCALATED', escalated: true },
      })
    );
  });

  it('does NOT auto-escalate when recent report count < 3', async () => {
    vi.mocked(prisma.moderationReport.create).mockResolvedValueOnce(mockReport as any);
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(2);

    const res = await request(app)
      .post('/api/moderation/reports')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(prisma.moderationReport.updateMany).not.toHaveBeenCalled();
  });

  it('defaults chatSnapshot to empty array when omitted', async () => {
    vi.mocked(prisma.moderationReport.create).mockResolvedValueOnce({
      ...mockReport,
      chatSnapshot: [],
    } as any);
    vi.mocked(prisma.moderationReport.count).mockResolvedValueOnce(0);

    const res = await request(app)
      .post('/api/moderation/reports')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ reporterId: 'player-1', reportedId: 'player-2', reason: 'Cheating' });

    expect(res.status).toBe(201);
  });
});

// ── PATCH /api/moderation/reports/:id ────────────────────────────────────────

describe('PATCH /api/moderation/reports/:id', () => {
  it('resolves a report with status RESOLVED and sets resolvedAt', async () => {
    const resolved = { ...mockReport, status: 'RESOLVED', resolvedAt: new Date().toISOString(), resolvedBy: 'user-admin' };
    vi.mocked(prisma.moderationReport.update).mockResolvedValueOnce(resolved as any);

    const res = await request(app)
      .patch('/api/moderation/reports/report-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(200);
    expect(prisma.moderationReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'report-1' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolvedAt: expect.any(Date),
          resolvedBy: 'user-admin',
        }),
      })
    );
  });

  it('updates report with status REVIEWED (no resolvedAt set)', async () => {
    const reviewed = { ...mockReport, status: 'REVIEWED' };
    vi.mocked(prisma.moderationReport.update).mockResolvedValueOnce(reviewed as any);

    const res = await request(app)
      .patch('/api/moderation/reports/report-1')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ status: 'REVIEWED' });

    expect(res.status).toBe(200);
    expect(prisma.moderationReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'report-1' },
        data: expect.objectContaining({ status: 'REVIEWED' }),
      })
    );
    // resolvedAt should NOT be set for REVIEWED
    const callData = vi.mocked(prisma.moderationReport.update).mock.calls[0][0];
    expect((callData as any).data.resolvedAt).toBeUndefined();
  });

  it('updates report with status ESCALATED', async () => {
    const escalated = { ...mockReport, status: 'ESCALATED', escalated: true };
    vi.mocked(prisma.moderationReport.update).mockResolvedValueOnce(escalated as any);

    const res = await request(app)
      .patch('/api/moderation/reports/report-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ESCALATED' });

    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/api/moderation/reports/report-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INVALID_STATUS' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/api/moderation/reports/report-1')
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(401);
  });

  it('works with MODERATOR token', async () => {
    const reviewed = { ...mockReport, status: 'REVIEWED' };
    vi.mocked(prisma.moderationReport.update).mockResolvedValueOnce(reviewed as any);

    const res = await request(app)
      .patch('/api/moderation/reports/report-1')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ status: 'REVIEWED' });

    expect(res.status).toBe(200);
  });
});

// ── POST /api/moderation/actions ─────────────────────────────────────────────

describe('POST /api/moderation/actions', () => {
  const validBody = {
    targetId: 'player-2',
    type: 'MUTE',
    reason: 'Excessive spamming',
  };

  it('creates action with service token', async () => {
    vi.mocked(prisma.moderationAction.create).mockResolvedValueOnce(mockAction as any);

    const res = await request(app)
      .post('/api/moderation/actions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('action-1');
    expect(prisma.moderationAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetId: 'player-2',
          type: 'MUTE',
          reason: 'Excessive spamming',
        }),
      })
    );
  });

  it('creates action with expiresAt when provided', async () => {
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    vi.mocked(prisma.moderationAction.create).mockResolvedValueOnce({
      ...mockAction,
      expiresAt,
    } as any);

    const res = await request(app)
      .post('/api/moderation/actions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ ...validBody, expiresAt });

    expect(res.status).toBe(201);
    expect(prisma.moderationAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: new Date(expiresAt) }),
      })
    );
  });

  it('returns 403 with JWT instead of service token', async () => {
    const res = await request(app)
      .post('/api/moderation/actions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/moderation/actions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ targetId: 'player-2' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action type', async () => {
    const res = await request(app)
      .post('/api/moderation/actions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ ...validBody, type: 'INVALID_TYPE' });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/moderation/actions/admin ───────────────────────────────────────

describe('POST /api/moderation/actions/admin', () => {
  const validBody = {
    targetId: 'player-2',
    type: 'BAN',
    reason: 'Repeated violations',
  };

  it('SUPER_ADMIN can post admin action', async () => {
    vi.mocked(prisma.moderationAction.create).mockResolvedValueOnce({
      ...mockAction,
      type: 'BAN',
      adminId: 'user-admin',
    } as any);

    const res = await request(app)
      .post('/api/moderation/actions/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(prisma.moderationAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminId: 'user-admin',
          targetId: 'player-2',
          type: 'BAN',
        }),
      })
    );
  });

  it('MODERATOR can post admin action', async () => {
    vi.mocked(prisma.moderationAction.create).mockResolvedValueOnce({
      ...mockAction,
      type: 'KICK',
      adminId: 'user-mod',
    } as any);

    const res = await request(app)
      .post('/api/moderation/actions/admin')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ ...validBody, type: 'KICK' });

    expect(res.status).toBe(201);
  });

  it('regular PLAYER JWT returns 403', async () => {
    const res = await request(app)
      .post('/api/moderation/actions/admin')
      .set('Authorization', `Bearer ${playerToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(prisma.moderationAction.create).not.toHaveBeenCalled();
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/moderation/actions/admin')
      .send(validBody);

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .post('/api/moderation/actions/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetId: 'player-2' });

    expect(res.status).toBe(400);
  });

  it('sets expiresAt to null when not provided', async () => {
    vi.mocked(prisma.moderationAction.create).mockResolvedValueOnce(mockAction as any);

    await request(app)
      .post('/api/moderation/actions/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);

    expect(prisma.moderationAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: null }),
      })
    );
  });
});

// ── GET /api/moderation/audit-log ────────────────────────────────────────────

describe('GET /api/moderation/audit-log', () => {
  it('returns paginated list with JWT auth', async () => {
    vi.mocked(prisma.moderationAction.count).mockResolvedValueOnce(3);
    vi.mocked(prisma.moderationAction.findMany).mockResolvedValueOnce([mockAction] as any);

    const res = await request(app)
      .get('/api/moderation/audit-log')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.page).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/moderation/audit-log');
    expect(res.status).toBe(401);
  });

  it('filters by ?targetId', async () => {
    vi.mocked(prisma.moderationAction.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.moderationAction.findMany).mockResolvedValueOnce([mockAction] as any);

    const res = await request(app)
      .get('/api/moderation/audit-log?targetId=player-2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(prisma.moderationAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ targetId: 'player-2' }),
      })
    );
  });

  it('uses default limit of 50', async () => {
    vi.mocked(prisma.moderationAction.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.moderationAction.findMany).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/moderation/audit-log')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
    expect(prisma.moderationAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it('works with MODERATOR token', async () => {
    vi.mocked(prisma.moderationAction.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.moderationAction.findMany).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/moderation/audit-log')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
  });

  it('verifies no DELETE /audit-log route exists', async () => {
    const res = await request(app)
      .delete('/api/moderation/audit-log')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

// ── POST /api/moderation/chat-log ────────────────────────────────────────────

describe('POST /api/moderation/chat-log', () => {
  const entries = [
    { playerId: 'player-1', username: 'Notch', message: 'Hello world', flagged: false },
    { playerId: 'player-2', username: 'Herobrine', message: 'Spam spam spam', flagged: true },
  ];

  it('batch-inserts entries with service token', async () => {
    vi.mocked(prisma.chatLog.createMany).mockResolvedValueOnce({ count: 2 });

    const res = await request(app)
      .post('/api/moderation/chat-log')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(entries);

    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(2);
    expect(prisma.chatLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: entries })
    );
  });

  it('inserts a single entry', async () => {
    vi.mocked(prisma.chatLog.createMany).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/moderation/chat-log')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send([entries[0]]);

    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(1);
  });

  it('defaults flagged to false when omitted', async () => {
    vi.mocked(prisma.chatLog.createMany).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/moderation/chat-log')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send([{ playerId: 'player-1', username: 'Notch', message: 'Hello' }]);

    expect(res.status).toBe(201);
    expect(prisma.chatLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ flagged: false }),
        ]),
      })
    );
  });

  it('returns 403 with JWT instead of service token', async () => {
    const res = await request(app)
      .post('/api/moderation/chat-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(entries);

    expect(res.status).toBe(403);
  });

  it('returns 400 for malformed entries (empty array is invalid schema)', async () => {
    const res = await request(app)
      .post('/api/moderation/chat-log')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send([{ playerId: 'player-1' }]); // missing required fields

    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not an array', async () => {
    const res = await request(app)
      .post('/api/moderation/chat-log')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', username: 'Notch', message: 'Hello' });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/moderation/chat-log ─────────────────────────────────────────────

describe('GET /api/moderation/chat-log', () => {
  it('returns paginated list with JWT auth', async () => {
    vi.mocked(prisma.chatLog.count).mockResolvedValueOnce(10);
    vi.mocked(prisma.chatLog.findMany).mockResolvedValueOnce([mockChatLog] as any);

    const res = await request(app)
      .get('/api/moderation/chat-log')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(10);
    expect(res.body.meta.page).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/moderation/chat-log');
    expect(res.status).toBe(401);
  });

  it('passes search filter through to query', async () => {
    vi.mocked(prisma.chatLog.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.chatLog.findMany).mockResolvedValueOnce([mockChatLog] as any);

    const res = await request(app)
      .get('/api/moderation/chat-log?search=hello')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(prisma.chatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          message: { contains: 'hello', mode: 'insensitive' },
        }),
      })
    );
  });

  it('filters by ?playerId', async () => {
    vi.mocked(prisma.chatLog.count).mockResolvedValueOnce(5);
    vi.mocked(prisma.chatLog.findMany).mockResolvedValueOnce([mockChatLog] as any);

    const res = await request(app)
      .get('/api/moderation/chat-log?playerId=player-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(prisma.chatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ playerId: 'player-1' }),
      })
    );
  });

  it('ignores search query longer than 256 chars', async () => {
    vi.mocked(prisma.chatLog.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.chatLog.findMany).mockResolvedValueOnce([]);

    const longSearch = 'a'.repeat(257);
    const res = await request(app)
      .get(`/api/moderation/chat-log?search=${longSearch}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // search should be ignored, so no message filter in where clause
    expect(prisma.chatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
  });

  it('uses default limit of 50', async () => {
    vi.mocked(prisma.chatLog.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.chatLog.findMany).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/moderation/chat-log')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
    expect(prisma.chatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it('respects pagination params', async () => {
    vi.mocked(prisma.chatLog.count).mockResolvedValueOnce(200);
    vi.mocked(prisma.chatLog.findMany).mockResolvedValueOnce([mockChatLog] as any);

    const res = await request(app)
      .get('/api/moderation/chat-log?page=2&limit=25')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(2);
    expect(prisma.chatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 })
    );
  });
});

// ── POST /api/moderation/block ────────────────────────────────────────────────

describe('POST /api/moderation/block', () => {
  const validBody = { blockerId: 'player-1', blockedId: 'player-2' };

  it('creates a block with service token', async () => {
    vi.mocked(prisma.playerBlock.upsert).mockResolvedValueOnce(mockBlock as any);

    const res = await request(app)
      .post('/api/moderation/block')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('block-1');
    expect(prisma.playerBlock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { blockerId_blockedId: { blockerId: 'player-1', blockedId: 'player-2' } },
        create: { blockerId: 'player-1', blockedId: 'player-2' },
        update: {},
      })
    );
  });

  it('is idempotent — upsert called even if block already exists', async () => {
    vi.mocked(prisma.playerBlock.upsert).mockResolvedValueOnce(mockBlock as any);

    const res = await request(app)
      .post('/api/moderation/block')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(prisma.playerBlock.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns 403 with JWT instead of service token', async () => {
    const res = await request(app)
      .post('/api/moderation/block')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('returns 400 for missing blockerId or blockedId', async () => {
    const res = await request(app)
      .post('/api/moderation/block')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ blockerId: 'player-1' });

    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/moderation/block ──────────────────────────────────────────────

describe('DELETE /api/moderation/block', () => {
  it('removes a block using query params with service token', async () => {
    vi.mocked(prisma.playerBlock.deleteMany).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete('/api/moderation/block?blockerId=player-1&blockedId=player-2')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(204);
    expect(prisma.playerBlock.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { blockerId: 'player-1', blockedId: 'player-2' },
      })
    );
  });

  it('removes a block using request body with service token', async () => {
    vi.mocked(prisma.playerBlock.deleteMany).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete('/api/moderation/block')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ blockerId: 'player-1', blockedId: 'player-2' });

    expect(res.status).toBe(204);
  });

  it('returns 400 when blockerId and blockedId are missing', async () => {
    const res = await request(app)
      .delete('/api/moderation/block')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT instead of service token', async () => {
    const res = await request(app)
      .delete('/api/moderation/block?blockerId=player-1&blockedId=player-2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });
});

// ── GET /api/moderation/block/:playerId ───────────────────────────────────────

describe('GET /api/moderation/block/:playerId', () => {
  it('returns list of blocked player IDs with service token', async () => {
    vi.mocked(prisma.playerBlock.findMany).mockResolvedValueOnce([
      { blockedId: 'player-2' },
      { blockedId: 'player-3' },
    ] as any);

    const res = await request(app)
      .get('/api/moderation/block/player-1')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(['player-2', 'player-3']);
    expect(prisma.playerBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { blockerId: 'player-1' },
        select: { blockedId: true },
      })
    );
  });

  it('returns empty array when no blocks found', async () => {
    vi.mocked(prisma.playerBlock.findMany).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/moderation/block/player-99')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 403 with JWT instead of service token', async () => {
    const res = await request(app)
      .get('/api/moderation/block/player-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 without any token', async () => {
    const res = await request(app).get('/api/moderation/block/player-1');
    expect(res.status).toBe(403);
  });
});
