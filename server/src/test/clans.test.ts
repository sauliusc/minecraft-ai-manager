import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    clan: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    clanMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    clanInvite: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    clanWar: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    player: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    activityLog: {
      create: vi.fn().mockResolvedValue({}),
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

const SERVICE_TOKEN = 'test-bridge-secret';
const adminToken = signAccess({ sub: 'user-1', email: 'admin@test.com', role: 'SUPER_ADMIN', name: '', autoConfirm: true });
const modToken = signAccess({ sub: 'user-2', email: 'mod@test.com', role: 'MODERATOR', name: '', autoConfirm: false });
const userToken = signAccess({ sub: 'user-3', email: 'user@test.com', role: 'USER', name: '', autoConfirm: false });

const mockMemberLeader = { id: 'member-1', clanId: 'clan-1', playerId: 'player-1', role: 'LEADER' };
const mockMemberOfficer = { id: 'member-2', clanId: 'clan-1', playerId: 'player-2', role: 'OFFICER' };
const mockMemberRegular = { id: 'member-3', clanId: 'clan-1', playerId: 'player-3', role: 'MEMBER' };

const mockClan = {
  id: 'clan-1',
  name: 'Test Clan',
  tag: 'TC',
  leaderId: 'player-1',
  xp: 1500,
  level: 2,
  homeWorld: null,
  homeX: null,
  homeY: null,
  homeZ: null,
  createdAt: new Date().toISOString(),
  members: [mockMemberLeader],
};

const mockClanWithHome = {
  ...mockClan,
  homeWorld: 'world',
  homeX: 100,
  homeY: 64,
  homeZ: -200,
};

const mockWar = {
  id: 'war-1',
  clan1Id: 'clan-1',
  clan2Id: 'clan-2',
  type: 'SKYWARS',
  durationMs: 3600000,
  winnerId: null,
  clan1Score: 0,
  clan2Score: 0,
  startedAt: new Date().toISOString(),
  endedAt: null,
};

const mockInvite = {
  id: 'invite-1',
  clanId: 'clan-1',
  inviterId: 'player-1',
  inviteeId: 'player-99',
  expiresAt: new Date(Date.now() + 86400000),
};

beforeEach(() => {
  process.env.BRIDGE_SECRET = SERVICE_TOKEN;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/clans
// ---------------------------------------------------------------------------

describe('GET /api/clans', () => {
  it('returns paginated list with JWT auth', async () => {
    vi.mocked(prisma.clan.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.clan.findMany).mockResolvedValueOnce([mockClan] as any);
    const res = await request(app)
      .get('/api/clans')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
    expect(res.body.meta.pages).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/clans');
    expect(res.status).toBe(401);
  });

  it('accepts a regular user JWT', async () => {
    vi.mocked(prisma.clan.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.clan.findMany).mockResolvedValueOnce([] as any);
    const res = await request(app)
      .get('/api/clans')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('respects page and limit query params', async () => {
    vi.mocked(prisma.clan.count).mockResolvedValueOnce(50);
    vi.mocked(prisma.clan.findMany).mockResolvedValueOnce([] as any);
    const res = await request(app)
      .get('/api/clans?page=3&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(res.body.meta.limit).toBe(10);
    expect(prisma.clan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it('includes memberCount in each clan item', async () => {
    const clanWithMembers = { ...mockClan, members: [mockMemberLeader, mockMemberOfficer] };
    vi.mocked(prisma.clan.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.clan.findMany).mockResolvedValueOnce([clanWithMembers] as any);
    const res = await request(app)
      .get('/api/clans')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].memberCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/clans/:id
// ---------------------------------------------------------------------------

describe('GET /api/clans/:id', () => {
  it('returns clan with memberCount when found', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce(mockClan as any);
    const res = await request(app)
      .get('/api/clans/clan-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('clan-1');
    expect(res.body.name).toBe('Test Clan');
    expect(res.body.memberCount).toBe(1);
    expect(res.body.members).toEqual(['player-1']);
  });

  it('returns 404 for unknown clan', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/clans/unknown-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/clans/clan-1');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/clans/member/:playerId
// ---------------------------------------------------------------------------

describe('GET /api/clans/member/:playerId', () => {
  it('returns the clan for a player with service token', async () => {
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce({
      ...mockMemberLeader,
      clan: mockClan,
    } as any);
    const res = await request(app)
      .get('/api/clans/member/player-1')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('clan-1');
    expect(res.body.leaderId).toBe('player-1');
  });

  it('returns 404 if player is not in a clan', async () => {
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/clans/member/nobody')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 without service token', async () => {
    const res = await request(app)
      .get('/api/clans/member/player-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/clans/:id/home
// ---------------------------------------------------------------------------

describe('GET /api/clans/:id/home', () => {
  it('returns home coords when home is set', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({
      homeWorld: 'world',
      homeX: 100,
      homeY: 64,
      homeZ: -200,
    } as any);
    const res = await request(app)
      .get('/api/clans/clan-1/home')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.world).toBe('world');
    expect(res.body.x).toBe(100);
    expect(res.body.y).toBe(64);
    expect(res.body.z).toBe(-200);
  });

  it('returns 404 when clan does not exist', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/clans/unknown-id/home')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 404 when home is not set', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({
      homeWorld: null,
      homeX: null,
      homeY: null,
      homeZ: null,
    } as any);
    const res = await request(app)
      .get('/api/clans/clan-1/home')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_SET');
  });

  it('returns 403 without service token', async () => {
    const res = await request(app)
      .get('/api/clans/clan-1/home')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/clans/:id/wars
// ---------------------------------------------------------------------------

describe('GET /api/clans/:id/wars', () => {
  it('returns war history for a known clan', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ id: 'clan-1' } as any);
    vi.mocked(prisma.clanWar.findMany).mockResolvedValueOnce([mockWar] as any);
    const res = await request(app)
      .get('/api/clans/clan-1/wars')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.clanId).toBe('clan-1');
    expect(res.body.wars).toHaveLength(1);
    expect(res.body.wars[0].id).toBe('war-1');
  });

  it('returns 404 for unknown clan', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/clans/unknown-id/wars')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/clans/clan-1/wars');
    expect(res.status).toBe(401);
  });

  it('queries wars by both clan1Id and clan2Id', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ id: 'clan-1' } as any);
    vi.mocked(prisma.clanWar.findMany).mockResolvedValueOnce([] as any);
    await request(app)
      .get('/api/clans/clan-1/wars')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(prisma.clanWar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ clan1Id: 'clan-1' }, { clan2Id: 'clan-1' }] },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans
// ---------------------------------------------------------------------------

describe('POST /api/clans', () => {
  const validBody = { name: 'Test Clan', tag: 'TC', leaderId: 'player-1' };

  it('creates a clan, deducts 500 coins, returns 201', async () => {
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 1000 } as any);
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      const txMock = {
        player: { update: vi.fn().mockResolvedValue({}) },
        clan: {
          create: vi.fn().mockResolvedValue({ ...mockClan, members: [] }),
          findUnique: vi.fn().mockResolvedValue(mockClan),
        },
        clanMember: { create: vi.fn().mockResolvedValue(mockMemberLeader) },
      };
      return cb(txMock);
    });
    const res = await request(app)
      .post('/api/clans')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('clan-1');
    expect(res.body.name).toBe('Test Clan');
  });

  it('returns 402 when player has insufficient coins', async () => {
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 100 } as any);
    const res = await request(app)
      .post('/api/clans')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('PAYMENT_REQUIRED');
  });

  it('returns 409 if leader is already in a clan', async () => {
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(mockMemberLeader as any);
    const res = await request(app)
      .post('/api/clans')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.message).toMatch(/already in a clan/i);
  });

  it('returns 404 when player record does not exist', async () => {
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/clans')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it('returns 409 on duplicate name or tag (P2002)', async () => {
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 1000 } as any);
    const uniqueError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(uniqueError);
    const res = await request(app)
      .post('/api/clans')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/name or tag/i);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/clans')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ name: 'Only Name' });
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT instead of service token', async () => {
    const res = await request(app)
      .post('/api/clans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/:id/invites
// ---------------------------------------------------------------------------

describe('POST /api/clans/:id/invites', () => {
  const validBody = { clanId: 'clan-1', inviterId: 'player-1', inviteeId: 'player-99' };

  it('creates an invite when inviter is leader', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberLeader as any);
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.clanInvite.upsert).mockResolvedValueOnce(mockInvite as any);
    const res = await request(app)
      .post('/api/clans/clan-1/invites')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.inviteeId).toBe('player-99');
  });

  it('creates an invite when inviter is officer', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberOfficer as any);
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.clanInvite.upsert).mockResolvedValueOnce(mockInvite as any);
    const res = await request(app)
      .post('/api/clans/clan-1/invites')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ ...validBody, inviterId: 'player-2' });
    expect(res.status).toBe(201);
  });

  it('returns 403 if inviter is not a leader or officer', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/clans/clan-1/invites')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 409 if invitee is already in a clan', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberLeader as any);
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(mockMemberRegular as any);
    const res = await request(app)
      .post('/api/clans/clan-1/invites')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('returns 400 for missing body fields', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/invites')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ inviterId: 'player-1' });
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/:id/members
// ---------------------------------------------------------------------------

describe('POST /api/clans/:id/members', () => {
  const validBody = { playerId: 'player-99' };
  const validInvite = { ...mockInvite, expiresAt: new Date(Date.now() + 86400000) };

  it('joins clan with a valid invite', async () => {
    vi.mocked(prisma.clanInvite.findUnique).mockResolvedValueOnce(validInvite as any);
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(null);
    const newMember = { id: 'member-99', clanId: 'clan-1', playerId: 'player-99', role: 'MEMBER' };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      const txMock = {
        clanInvite: { delete: vi.fn().mockResolvedValue({}) },
        clanMember: { create: vi.fn().mockResolvedValue(newMember) },
      };
      return cb(txMock);
    });
    const res = await request(app)
      .post('/api/clans/clan-1/members')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.playerId).toBe('player-99');
    expect(res.body.role).toBe('MEMBER');
  });

  it('returns 403 when no invite exists', async () => {
    vi.mocked(prisma.clanInvite.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/clans/clan-1/members')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 403 when invite is expired', async () => {
    const expiredInvite = { ...mockInvite, expiresAt: new Date(Date.now() - 1000) };
    vi.mocked(prisma.clanInvite.findUnique).mockResolvedValueOnce(expiredInvite as any);
    const res = await request(app)
      .post('/api/clans/clan-1/members')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 409 if player is already in a clan', async () => {
    vi.mocked(prisma.clanInvite.findUnique).mockResolvedValueOnce(validInvite as any);
    vi.mocked(prisma.clanMember.findUnique).mockResolvedValueOnce(mockMemberRegular as any);
    const res = await request(app)
      .post('/api/clans/clan-1/members')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/:id/leave
// ---------------------------------------------------------------------------

describe('POST /api/clans/:id/leave', () => {
  it('returns 404 when player is not in the clan', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/clans/clan-1/leave')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'outsider' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('regular member leaves clan successfully', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberRegular as any);
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({
      ...mockClan,
      leaderId: 'player-1',
      members: [mockMemberLeader, mockMemberRegular],
    } as any);
    vi.mocked(prisma.clanMember.delete).mockResolvedValueOnce(mockMemberRegular as any);
    const res = await request(app)
      .post('/api/clans/clan-1/leave')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-3' });
    expect(res.status).toBe(200);
    expect(res.body.left).toBe(true);
    expect(prisma.clanMember.delete).toHaveBeenCalledWith({ where: { id: 'member-3' } });
  });

  it('leader disbands clan when last member', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberLeader as any);
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({
      ...mockClan,
      leaderId: 'player-1',
      members: [mockMemberLeader],
    } as any);
    vi.mocked(prisma.clan.delete).mockResolvedValueOnce(mockClan as any);
    const res = await request(app)
      .post('/api/clans/clan-1/leave')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(200);
    expect(res.body.disbanded).toBe(true);
    expect(prisma.clan.delete).toHaveBeenCalledWith({ where: { id: 'clan-1' } });
  });

  it('leader transfers to officer when others remain', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberLeader as any);
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({
      ...mockClan,
      leaderId: 'player-1',
      members: [mockMemberLeader, mockMemberOfficer],
    } as any);
    vi.mocked(prisma.$transaction).mockResolvedValueOnce([{}, {}, {}] as any);
    const res = await request(app)
      .post('/api/clans/clan-1/leave')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(200);
    expect(res.body.left).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('leader transfers to first member when no officer present', async () => {
    const memberNoOfficer = { id: 'member-4', clanId: 'clan-1', playerId: 'player-4', role: 'MEMBER' };
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberLeader as any);
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({
      ...mockClan,
      leaderId: 'player-1',
      members: [mockMemberLeader, memberNoOfficer],
    } as any);
    vi.mocked(prisma.$transaction).mockResolvedValueOnce([{}, {}, {}] as any);
    const res = await request(app)
      .post('/api/clans/clan-1/leave')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(200);
    expect(res.body.left).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/leave')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/:id/home
// ---------------------------------------------------------------------------

describe('POST /api/clans/:id/home', () => {
  const validBody = { world: 'world', x: 100, y: 64, z: -200 };

  it('sets home coordinates and returns them', async () => {
    vi.mocked(prisma.clan.update).mockResolvedValueOnce(mockClanWithHome as any);
    const res = await request(app)
      .post('/api/clans/clan-1/home')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.world).toBe('world');
    expect(res.body.x).toBe(100);
    expect(res.body.y).toBe(64);
    expect(res.body.z).toBe(-200);
  });

  it('returns 404 when clan does not exist (P2025)', async () => {
    const notFoundErr = Object.assign(new Error('Record not found'), { code: 'P2025' });
    vi.mocked(prisma.clan.update).mockRejectedValueOnce(notFoundErr);
    const res = await request(app)
      .post('/api/clans/unknown-id/home')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/home')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ world: 'world' });
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/home')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/:id/xp
// ---------------------------------------------------------------------------

describe('POST /api/clans/:id/xp', () => {
  it('increments XP and recalculates level', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ xp: 500 } as any);
    vi.mocked(prisma.clan.update).mockResolvedValueOnce({ id: 'clan-1', xp: 1500, level: 2 } as any);
    const res = await request(app)
      .post('/api/clans/clan-1/xp')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ xp: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.xp).toBe(1500);
    expect(res.body.level).toBe(2);
  });

  it('caps level at 10 for very high XP', async () => {
    // 9000 XP + 1000 = 10000; clanLevel(10000) = min(10, floor(10000/1000)+1) = min(10,11) = 10
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ xp: 9000 } as any);
    vi.mocked(prisma.clan.update).mockResolvedValueOnce({ id: 'clan-1', xp: 10000, level: 10 } as any);
    const res = await request(app)
      .post('/api/clans/clan-1/xp')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ xp: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.level).toBe(10);
    expect(prisma.clan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: 10 }),
      })
    );
  });

  it('level stays 1 below 1000 XP', async () => {
    // 0 + 999 = 999; clanLevel(999) = min(10, floor(999/1000)+1) = 1
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ xp: 0 } as any);
    vi.mocked(prisma.clan.update).mockResolvedValueOnce({ id: 'clan-1', xp: 999, level: 1 } as any);
    const res = await request(app)
      .post('/api/clans/clan-1/xp')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ xp: 999 });
    expect(res.status).toBe(200);
    expect(prisma.clan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: 1 }),
      })
    );
  });

  it('level becomes 2 at exactly 1000 XP', async () => {
    // 0 + 1000 = 1000; clanLevel(1000) = min(10, floor(1000/1000)+1) = 2
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ xp: 0 } as any);
    vi.mocked(prisma.clan.update).mockResolvedValueOnce({ id: 'clan-1', xp: 1000, level: 2 } as any);
    const res = await request(app)
      .post('/api/clans/clan-1/xp')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ xp: 1000 });
    expect(res.status).toBe(200);
    expect(prisma.clan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: 2 }),
      })
    );
  });

  it('returns 404 when clan does not exist (P2025)', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ xp: 0 } as any);
    const notFoundErr = Object.assign(new Error('Record not found'), { code: 'P2025' });
    vi.mocked(prisma.clan.update).mockRejectedValueOnce(notFoundErr);
    const res = await request(app)
      .post('/api/clans/unknown-id/xp')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ xp: 100 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for non-positive xp', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/xp')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ xp: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/xp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ xp: 100 });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/clans/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/clans/:id', () => {
  it('deletes clan with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.clan.delete).mockResolvedValueOnce(mockClan as any);
    const res = await request(app)
      .delete('/api/clans/clan-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    expect(prisma.clan.delete).toHaveBeenCalledWith({ where: { id: 'clan-1' } });
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .delete('/api/clans/clan-1')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/clans/clan-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown clan (P2025)', async () => {
    const notFoundErr = Object.assign(new Error('Record not found'), { code: 'P2025' });
    vi.mocked(prisma.clan.delete).mockRejectedValueOnce(notFoundErr);
    const res = await request(app)
      .delete('/api/clans/unknown-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/:id/kick
// ---------------------------------------------------------------------------

describe('POST /api/clans/:id/kick', () => {
  it('leader kicks a regular member', async () => {
    vi.mocked(prisma.clanMember.findFirst)
      .mockResolvedValueOnce(mockMemberLeader as any)  // kicker check
      .mockResolvedValueOnce(mockMemberRegular as any); // target check
    vi.mocked(prisma.clanMember.delete).mockResolvedValueOnce(mockMemberRegular as any);
    const res = await request(app)
      .post('/api/clans/clan-1/kick')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-3', kickerId: 'player-1' });
    expect(res.status).toBe(200);
    expect(res.body.kicked).toBe(true);
    expect(res.body.playerId).toBe('player-3');
    expect(prisma.clanMember.delete).toHaveBeenCalledWith({ where: { id: 'member-3' } });
  });

  it('officer kicks a regular member', async () => {
    vi.mocked(prisma.clanMember.findFirst)
      .mockResolvedValueOnce(mockMemberOfficer as any)
      .mockResolvedValueOnce(mockMemberRegular as any);
    vi.mocked(prisma.clanMember.delete).mockResolvedValueOnce(mockMemberRegular as any);
    const res = await request(app)
      .post('/api/clans/clan-1/kick')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-3', kickerId: 'player-2' });
    expect(res.status).toBe(200);
    expect(res.body.kicked).toBe(true);
  });

  it('returns 403 when kicker is not leader/officer', async () => {
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/clans/clan-1/kick')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-3', kickerId: 'player-3' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 404 when target is not in clan', async () => {
    vi.mocked(prisma.clanMember.findFirst)
      .mockResolvedValueOnce(mockMemberLeader as any)
      .mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/clans/clan-1/kick')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'outsider', kickerId: 'player-1' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 when trying to kick the clan leader', async () => {
    vi.mocked(prisma.clanMember.findFirst)
      .mockResolvedValueOnce(mockMemberOfficer as any)
      .mockResolvedValueOnce(mockMemberLeader as any);
    const res = await request(app)
      .post('/api/clans/clan-1/kick')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', kickerId: 'player-2' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/leader/i);
  });

  it('returns 403 when officer tries to kick another officer', async () => {
    const secondOfficer = { id: 'member-5', clanId: 'clan-1', playerId: 'player-5', role: 'OFFICER' };
    vi.mocked(prisma.clanMember.findFirst)
      .mockResolvedValueOnce(mockMemberOfficer as any)
      .mockResolvedValueOnce(secondOfficer as any);
    const res = await request(app)
      .post('/api/clans/clan-1/kick')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-5', kickerId: 'player-2' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing body fields', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/kick')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ kickerId: 'player-1' });
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/kick')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-3', kickerId: 'player-1' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/clans/:id/members/:memberId
// ---------------------------------------------------------------------------

describe('PATCH /api/clans/:id/members/:memberId', () => {
  const updatedOfficer = { ...mockMemberRegular, role: 'OFFICER' };
  const updatedMember = { ...mockMemberOfficer, role: 'MEMBER' };

  it('promotes a member to officer', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ leaderId: 'player-1' } as any);
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberRegular as any);
    vi.mocked(prisma.clanMember.update).mockResolvedValueOnce(updatedOfficer as any);
    const res = await request(app)
      .patch('/api/clans/clan-1/members/player-3')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ role: 'OFFICER' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('OFFICER');
    expect(prisma.clanMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'OFFICER' } })
    );
  });

  it('demotes an officer to member', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ leaderId: 'player-1' } as any);
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberOfficer as any);
    vi.mocked(prisma.clanMember.update).mockResolvedValueOnce(updatedMember as any);
    const res = await request(app)
      .patch('/api/clans/clan-1/members/player-2')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ role: 'MEMBER' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('MEMBER');
  });

  it('returns 404 when clan does not exist', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch('/api/clans/unknown-clan/members/player-3')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ role: 'OFFICER' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 404 when member is not in the clan', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ leaderId: 'player-1' } as any);
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch('/api/clans/clan-1/members/outsider')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ role: 'OFFICER' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 when trying to change the leader role', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ leaderId: 'player-1' } as any);
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValueOnce(mockMemberLeader as any);
    const res = await request(app)
      .patch('/api/clans/clan-1/members/player-1')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ role: 'OFFICER' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 400 for invalid role value', async () => {
    const res = await request(app)
      .patch('/api/clans/clan-1/members/player-3')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ role: 'LEADER' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing role field', async () => {
    const res = await request(app)
      .patch('/api/clans/clan-1/members/player-3')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .patch('/api/clans/clan-1/members/player-3')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'OFFICER' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/:id/disband
// ---------------------------------------------------------------------------

describe('POST /api/clans/:id/disband', () => {
  it('disbands clan with service token', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce({ id: 'clan-1' } as any);
    vi.mocked(prisma.clan.delete).mockResolvedValueOnce(mockClan as any);
    const res = await request(app)
      .post('/api/clans/clan-1/disband')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.disbanded).toBe(true);
    expect(prisma.clan.delete).toHaveBeenCalledWith({ where: { id: 'clan-1' } });
  });

  it('returns 404 when clan does not exist', async () => {
    vi.mocked(prisma.clan.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/clans/unknown-id/disband')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/clan-1/disband')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/wars
// ---------------------------------------------------------------------------

describe('POST /api/clans/wars', () => {
  const validBody = {
    warId: 'war-1',
    clan1Id: 'clan-1',
    clan2Id: 'clan-2',
    type: 'SKYWARS',
    durationMs: 3600000,
  };

  it('creates a war with service token', async () => {
    vi.mocked(prisma.clanWar.create).mockResolvedValueOnce(mockWar as any);
    const res = await request(app)
      .post('/api/clans/wars')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('war-1');
    expect(res.body.clan1Id).toBe('clan-1');
  });

  it('returns 409 on duplicate warId (P2002)', async () => {
    const uniqueError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    vi.mocked(prisma.clanWar.create).mockRejectedValueOnce(uniqueError);
    const res = await request(app)
      .post('/api/clans/wars')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/clans/wars')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ warId: 'war-1', clan1Id: 'clan-1' });
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/wars')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clans/wars/:warId/result
// ---------------------------------------------------------------------------

describe('POST /api/clans/wars/:warId/result', () => {
  const validBody = {
    warId: 'war-1',
    winnerId: 'clan-1',
    clan1Score: 5,
    clan2Score: 3,
  };

  it('updates war with scores and winner', async () => {
    const updatedWar = { ...mockWar, winnerId: 'clan-1', clan1Score: 5, clan2Score: 3, endedAt: new Date().toISOString() };
    vi.mocked(prisma.clanWar.update).mockResolvedValueOnce(updatedWar as any);
    const res = await request(app)
      .post('/api/clans/wars/war-1/result')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.winnerId).toBe('clan-1');
    expect(res.body.clan1Score).toBe(5);
    expect(res.body.clan2Score).toBe(3);
  });

  it('allows no winner (draw)', async () => {
    const drawBody = { warId: 'war-1', clan1Score: 3, clan2Score: 3 };
    const updatedWar = { ...mockWar, winnerId: null, clan1Score: 3, clan2Score: 3, endedAt: new Date().toISOString() };
    vi.mocked(prisma.clanWar.update).mockResolvedValueOnce(updatedWar as any);
    const res = await request(app)
      .post('/api/clans/wars/war-1/result')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(drawBody);
    expect(res.status).toBe(200);
    expect(res.body.winnerId).toBeNull();
  });

  it('returns 404 for unknown war (P2025)', async () => {
    const notFoundErr = Object.assign(new Error('Record not found'), { code: 'P2025' });
    vi.mocked(prisma.clanWar.update).mockRejectedValueOnce(notFoundErr);
    const res = await request(app)
      .post('/api/clans/wars/unknown-war/result')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for missing scores', async () => {
    const res = await request(app)
      .post('/api/clans/wars/war-1/result')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ warId: 'war-1', winnerId: 'clan-1' });
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT token', async () => {
    const res = await request(app)
      .post('/api/clans/wars/war-1/result')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});
