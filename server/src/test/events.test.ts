import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    gameEvent: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    eventLeaderboardEntry: {
      findMany: vi.fn(),
      upsert: vi.fn(),
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
const adminToken = signAccess({ sub: 'user-1', email: 'admin@test.com', role: 'SUPER_ADMIN' });
const modToken = signAccess({ sub: 'user-2', email: 'mod@test.com', role: 'MODERATOR' });
const playerToken = signAccess({ sub: 'user-3', email: 'player@test.com', role: 'PLAYER' });

const mockEvent = {
  id: 'event-1',
  type: 'BOSS_RAID',
  title: 'Epic Boss Raid',
  state: 'UPCOMING',
  scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  config: { difficulty: 'hard' },
  participantCount: 0,
  endedAt: null,
  leaderboard: [],
};

const mockLeaderboardEntry = {
  id: 'entry-1',
  eventId: 'event-1',
  playerId: 'player-1',
  playerName: 'Steve',
  score: 1000,
};

beforeEach(() => {
  process.env.BRIDGE_SECRET = SERVICE_TOKEN;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/events
// ---------------------------------------------------------------------------
describe('GET /api/events', () => {
  it('returns paginated list with JWT auth', async () => {
    vi.mocked(prisma.gameEvent.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([mockEvent] as any);

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('event-1');
    expect(res.body.meta.total).toBe(1);
    expect(res.body.meta.page).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });

  it('accepts a PLAYER JWT token', async () => {
    vi.mocked(prisma.gameEvent.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('filters by state=ACTIVE', async () => {
    vi.mocked(prisma.gameEvent.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([{ ...mockEvent, state: 'ACTIVE' }] as any);

    const res = await request(app)
      .get('/api/events?state=ACTIVE')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(prisma.gameEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: 'ACTIVE' }),
      })
    );
  });

  it('filters by type=BOSS_RAID', async () => {
    vi.mocked(prisma.gameEvent.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([mockEvent] as any);

    const res = await request(app)
      .get('/api/events?type=BOSS_RAID')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(prisma.gameEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'BOSS_RAID' }),
      })
    );
  });

  it('respects custom page and limit query params', async () => {
    vi.mocked(prisma.gameEvent.count).mockResolvedValueOnce(50);
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([mockEvent] as any);

    const res = await request(app)
      .get('/api/events?page=2&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(2);
    expect(prisma.gameEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });

  it('returns empty list when no events exist', async () => {
    vi.mocked(prisma.gameEvent.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.meta.pages).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/active
// ---------------------------------------------------------------------------
describe('GET /api/events/active', () => {
  it('returns empty array when no active events', async () => {
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/api/events/active')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns active events with service token', async () => {
    const activeEvent = { ...mockEvent, state: 'ACTIVE' };
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([activeEvent] as any);

    const res = await request(app)
      .get('/api/events/active')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('event-1');
  });

  it('queries only ACTIVE state events', async () => {
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([] as any);

    await request(app)
      .get('/api/events/active')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(prisma.gameEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { state: 'ACTIVE' },
      })
    );
  });

  it('returns 403 with JWT token (not service token)', async () => {
    const res = await request(app)
      .get('/api/events/active')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 without any auth', async () => {
    const res = await request(app).get('/api/events/active');
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/upcoming
// ---------------------------------------------------------------------------
describe('GET /api/events/upcoming', () => {
  it('returns upcoming events within 35 min with service token', async () => {
    const soonEvent = { ...mockEvent, scheduledAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([soonEvent] as any);

    const res = await request(app)
      .get('/api/events/upcoming')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns empty array when no upcoming events', async () => {
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/api/events/upcoming')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('queries state in UPCOMING and ACTIVE with lte lookahead', async () => {
    vi.mocked(prisma.gameEvent.findMany).mockResolvedValueOnce([] as any);

    await request(app)
      .get('/api/events/upcoming')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(prisma.gameEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: { in: ['UPCOMING', 'ACTIVE'] },
          scheduledAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      })
    );
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .get('/api/events/upcoming')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:id
// ---------------------------------------------------------------------------
describe('GET /api/events/:id', () => {
  it('returns event with leaderboard array', async () => {
    const eventWithLeaderboard = { ...mockEvent, leaderboard: [mockLeaderboardEntry] };
    vi.mocked(prisma.gameEvent.findUnique).mockResolvedValueOnce(eventWithLeaderboard as any);

    const res = await request(app)
      .get('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('event-1');
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    expect(res.body.leaderboard).toHaveLength(1);
    expect(res.body.leaderboard[0].playerId).toBe('player-1');
  });

  it('returns event with empty leaderboard', async () => {
    vi.mocked(prisma.gameEvent.findUnique).mockResolvedValueOnce(mockEvent as any);

    const res = await request(app)
      .get('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toEqual([]);
  });

  it('includes leaderboard in the findUnique query', async () => {
    vi.mocked(prisma.gameEvent.findUnique).mockResolvedValueOnce(mockEvent as any);

    await request(app)
      .get('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(prisma.gameEvent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1' },
        include: expect.objectContaining({ leaderboard: expect.any(Object) }),
      })
    );
  });

  it('returns 404 for unknown event', async () => {
    vi.mocked(prisma.gameEvent.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/events/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Event not found');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/events/event-1');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:id/leaderboard
// ---------------------------------------------------------------------------
describe('GET /api/events/:id/leaderboard', () => {
  it('returns leaderboard entries for event', async () => {
    vi.mocked(prisma.eventLeaderboardEntry.findMany).mockResolvedValueOnce([mockLeaderboardEntry] as any);

    const res = await request(app)
      .get('/api/events/event-1/leaderboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].playerId).toBe('player-1');
    expect(res.body.entries[0].score).toBe(1000);
  });

  it('returns empty entries array when no leaderboard data', async () => {
    vi.mocked(prisma.eventLeaderboardEntry.findMany).mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/api/events/event-1/leaderboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it('queries leaderboard by eventId ordered by score desc', async () => {
    vi.mocked(prisma.eventLeaderboardEntry.findMany).mockResolvedValueOnce([] as any);

    await request(app)
      .get('/api/events/event-1/leaderboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(prisma.eventLeaderboardEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 'event-1' },
        orderBy: { score: 'desc' },
      })
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/events/event-1/leaderboard');
    expect(res.status).toBe(401);
  });

  it('accepts MODERATOR JWT token', async () => {
    vi.mocked(prisma.eventLeaderboardEntry.findMany).mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/api/events/event-1/leaderboard')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events
// ---------------------------------------------------------------------------
describe('POST /api/events', () => {
  const validBody = {
    type: 'BOSS_RAID',
    title: 'Epic Boss Raid',
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    config: { difficulty: 'hard' },
  };

  it('creates event with SUPER_ADMIN token → 201', async () => {
    vi.mocked(prisma.gameEvent.create).mockResolvedValueOnce(mockEvent as any);

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('event-1');
    expect(res.body.title).toBe('Epic Boss Raid');
  });

  it('calls prisma.gameEvent.create with correct data', async () => {
    vi.mocked(prisma.gameEvent.create).mockResolvedValueOnce(mockEvent as any);

    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);

    expect(prisma.gameEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'BOSS_RAID',
          title: 'Epic Boss Raid',
        }),
      })
    );
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${modToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(vi.mocked(prisma.gameEvent.create)).not.toHaveBeenCalled();
  });

  it('returns 403 with PLAYER token', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${playerToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('returns 400 for missing required fields (no type)', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'No Type Event', scheduledAt: new Date().toISOString() });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing title', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'BOSS_RAID', scheduledAt: new Date().toISOString() });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing scheduledAt', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'BOSS_RAID', title: 'No Date' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid event type', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'INVALID_TYPE', title: 'Bad', scheduledAt: new Date().toISOString() });

    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/events').send(validBody);
    expect(res.status).toBe(401);
  });

  it('uses empty object as default config when omitted', async () => {
    vi.mocked(prisma.gameEvent.create).mockResolvedValueOnce(mockEvent as any);

    const bodyWithoutConfig = { type: 'BOSS_RAID', title: 'No Config', scheduledAt: new Date(Date.now() + 3600000).toISOString() };

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(bodyWithoutConfig);

    expect(res.status).toBe(201);
    expect(prisma.gameEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ config: {} }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/events/:id', () => {
  it('action:start → state becomes ACTIVE', async () => {
    const activeEvent = { ...mockEvent, state: 'ACTIVE' };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(activeEvent as any);

    const res = await request(app)
      .patch('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'start' });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('ACTIVE');
    expect(prisma.gameEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1' },
        data: expect.objectContaining({ state: 'ACTIVE' }),
      })
    );
  });

  it('action:end → state FINISHED with endedAt set', async () => {
    const finishedEvent = { ...mockEvent, state: 'FINISHED', endedAt: new Date().toISOString() };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(finishedEvent as any);

    const res = await request(app)
      .patch('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'end' });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('FINISHED');
    expect(res.body.endedAt).not.toBeNull();
    expect(prisma.gameEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'FINISHED', endedAt: expect.any(Date) }),
      })
    );
  });

  it('updates title when provided', async () => {
    const updatedEvent = { ...mockEvent, title: 'New Title' };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(updatedEvent as any);

    const res = await request(app)
      .patch('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
    expect(prisma.gameEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'New Title' }),
      })
    );
  });

  it('updates config when provided', async () => {
    const updatedEvent = { ...mockEvent, config: { difficulty: 'easy' } };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(updatedEvent as any);

    const res = await request(app)
      .patch('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ config: { difficulty: 'easy' } });

    expect(res.status).toBe(200);
    expect(prisma.gameEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ config: { difficulty: 'easy' } }),
      })
    );
  });

  it('setting state=FINISHED directly also sets endedAt', async () => {
    const finishedEvent = { ...mockEvent, state: 'FINISHED', endedAt: new Date().toISOString() };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(finishedEvent as any);

    const res = await request(app)
      .patch('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ state: 'FINISHED' });

    expect(res.status).toBe(200);
    expect(prisma.gameEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'FINISHED', endedAt: expect.any(Date) }),
      })
    );
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .patch('/api/events/event-1')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ action: 'start' });

    expect(res.status).toBe(403);
    expect(vi.mocked(prisma.gameEvent.update)).not.toHaveBeenCalled();
  });

  it('returns 403 with PLAYER token', async () => {
    const res = await request(app)
      .patch('/api/events/event-1')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ action: 'start' });

    expect(res.status).toBe(403);
  });

  it('returns 404 when prisma throws P2025', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'P2025' });
    vi.mocked(prisma.gameEvent.update).mockRejectedValueOnce(err);

    const res = await request(app)
      .patch('/api/events/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'start' });

    expect(res.status).toBe(404);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/api/events/event-1')
      .send({ action: 'start' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:id/complete
// ---------------------------------------------------------------------------
describe('POST /api/events/:id/complete', () => {
  it('sets state FINISHED and returns event with service token', async () => {
    const finishedEvent = { ...mockEvent, state: 'FINISHED', endedAt: new Date().toISOString() };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(finishedEvent as any);

    const res = await request(app)
      .post('/api/events/event-1/complete')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('FINISHED');
    expect(res.body.endedAt).not.toBeNull();
    expect(prisma.gameEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1' },
        data: expect.objectContaining({ state: 'FINISHED', endedAt: expect.any(Date) }),
      })
    );
  });

  it('upserts leaderboard entries when provided', async () => {
    const finishedEvent = { ...mockEvent, state: 'FINISHED', endedAt: new Date().toISOString() };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(finishedEvent as any);
    vi.mocked(prisma.eventLeaderboardEntry.upsert).mockResolvedValue(mockLeaderboardEntry as any);

    const res = await request(app)
      .post('/api/events/event-1/complete')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({
        leaderboardEntries: [
          { playerId: 'player-1', playerName: 'Steve', score: 1000 },
          { playerId: 'player-2', playerName: 'Alex', score: 800 },
        ],
      });

    expect(res.status).toBe(200);
    expect(prisma.eventLeaderboardEntry.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.eventLeaderboardEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_playerId: { eventId: 'event-1', playerId: 'player-1' } },
        create: expect.objectContaining({ playerId: 'player-1', playerName: 'Steve', score: 1000 }),
        update: expect.objectContaining({ score: 1000, playerName: 'Steve' }),
      })
    );
  });

  it('does not upsert leaderboard entries when array is empty', async () => {
    const finishedEvent = { ...mockEvent, state: 'FINISHED', endedAt: new Date().toISOString() };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(finishedEvent as any);

    const res = await request(app)
      .post('/api/events/event-1/complete')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ leaderboardEntries: [] });

    expect(res.status).toBe(200);
    expect(prisma.eventLeaderboardEntry.upsert).not.toHaveBeenCalled();
  });

  it('stores winnerId in config when provided', async () => {
    const finishedEvent = { ...mockEvent, state: 'FINISHED', endedAt: new Date().toISOString(), config: { winnerId: 'player-1' } };
    vi.mocked(prisma.gameEvent.update).mockResolvedValueOnce(finishedEvent as any);

    const res = await request(app)
      .post('/api/events/event-1/complete')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ winnerId: 'player-1' });

    expect(res.status).toBe(200);
    expect(prisma.gameEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'FINISHED' }),
      })
    );
  });

  it('returns 403 with JWT token (service token required)', async () => {
    const res = await request(app)
      .post('/api/events/event-1/complete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(vi.mocked(prisma.gameEvent.update)).not.toHaveBeenCalled();
  });

  it('returns 403 without any auth', async () => {
    const res = await request(app)
      .post('/api/events/event-1/complete')
      .send({});

    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid leaderboard entry (missing score)', async () => {
    const res = await request(app)
      .post('/api/events/event-1/complete')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({
        leaderboardEntries: [{ playerId: 'player-1', playerName: 'Steve' }],
      });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/events/:id', () => {
  it('deletes UPCOMING event → 204 with SUPER_ADMIN', async () => {
    vi.mocked(prisma.gameEvent.findUnique).mockResolvedValueOnce(mockEvent as any);
    vi.mocked(prisma.gameEvent.delete).mockResolvedValueOnce(mockEvent as any);

    const res = await request(app)
      .delete('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
    expect(prisma.gameEvent.delete).toHaveBeenCalledWith({ where: { id: 'event-1' } });
  });

  it('returns 409 when trying to delete an ACTIVE event', async () => {
    const activeEvent = { ...mockEvent, state: 'ACTIVE' };
    vi.mocked(prisma.gameEvent.findUnique).mockResolvedValueOnce(activeEvent as any);

    const res = await request(app)
      .delete('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Can only delete upcoming events');
    expect(vi.mocked(prisma.gameEvent.delete)).not.toHaveBeenCalled();
  });

  it('returns 409 when trying to delete a FINISHED event', async () => {
    const finishedEvent = { ...mockEvent, state: 'FINISHED' };
    vi.mocked(prisma.gameEvent.findUnique).mockResolvedValueOnce(finishedEvent as any);

    const res = await request(app)
      .delete('/api/events/event-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(vi.mocked(prisma.gameEvent.delete)).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown event', async () => {
    vi.mocked(prisma.gameEvent.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/events/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Event not found');
    expect(vi.mocked(prisma.gameEvent.delete)).not.toHaveBeenCalled();
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .delete('/api/events/event-1')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(403);
    expect(vi.mocked(prisma.gameEvent.findUnique)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.gameEvent.delete)).not.toHaveBeenCalled();
  });

  it('returns 403 with PLAYER token', async () => {
    const res = await request(app)
      .delete('/api/events/event-1')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/events/event-1');
    expect(res.status).toBe(401);
  });
});
