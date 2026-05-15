import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    player: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    economyAuditLog: {
      create: vi.fn(),
    },
    marketListing: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
const adminToken = signAccess({ sub: 'admin-1', email: 'admin@test.com', role: 'SUPER_ADMIN' });
const modToken = signAccess({ sub: 'mod-1', email: 'mod@test.com', role: 'MODERATOR' });

const mockPlayer = {
  id: 'player-1',
  username: 'TestPlayer',
  coins: 1000,
  crystals: 50,
};

const mockListing = {
  id: 'listing-1',
  sellerId: 'player-1',
  material: 'DIAMOND',
  amount: 5,
  price: 100,
  fee: 10,
  sold: false,
  buyerId: null,
  soldAt: null,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 7 * 86_400_000),
};

beforeEach(() => {
  process.env.BRIDGE_SECRET = SERVICE_TOKEN;
  vi.clearAllMocks();
  // Default $transaction: array form resolves via Promise.all, callback form calls callback with prisma
  vi.mocked(prisma.$transaction).mockImplementation((ops: any) => {
    if (Array.isArray(ops)) {
      return Promise.all(ops);
    }
    return ops(prisma);
  });
});

// ---------------------------------------------------------------------------
// GET /api/economy/balance/:playerId
// ---------------------------------------------------------------------------
describe('GET /api/economy/balance/:playerId', () => {
  it('returns player balance with service token', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(mockPlayer as any);
    const res = await request(app)
      .get('/api/economy/balance/player-1')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('player-1');
    expect(res.body.coins).toBe(1000);
    expect(res.body.crystals).toBe(50);
  });

  it('returns 404 when player not found', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/economy/balance/unknown-player')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 with JWT token instead of service token', async () => {
    const res = await request(app)
      .get('/api/economy/balance/player-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 without any token', async () => {
    const res = await request(app).get('/api/economy/balance/player-1');
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/economy/balances
// ---------------------------------------------------------------------------
describe('GET /api/economy/balances', () => {
  const topPlayers = [
    { id: 'player-1', username: 'RichPlayer', coins: 9999, crystals: 100 },
    { id: 'player-2', username: 'SecondPlayer', coins: 5000, crystals: 200 },
  ];

  it('returns top coins and crystals lists with JWT token', async () => {
    vi.mocked(prisma.player.findMany)
      .mockResolvedValueOnce(topPlayers as any)
      .mockResolvedValueOnce(topPlayers as any);
    const res = await request(app)
      .get('/api/economy/balances')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('topCoins');
    expect(res.body).toHaveProperty('topCrystals');
    expect(res.body.topCoins).toHaveLength(2);
    expect(res.body.topCrystals).toHaveLength(2);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/economy/balances');
    expect(res.status).toBe(401);
  });

  it('works with MODERATOR token (no admin required)', async () => {
    vi.mocked(prisma.player.findMany)
      .mockResolvedValueOnce(topPlayers as any)
      .mockResolvedValueOnce(topPlayers as any);
    const res = await request(app)
      .get('/api/economy/balances')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/economy/transfer
// ---------------------------------------------------------------------------
describe('POST /api/economy/transfer', () => {
  const validBody = { fromId: 'player-1', toId: 'player-2', amount: 100 };

  it('transfers coins successfully', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 1000 } as any);
    vi.mocked(prisma.player.update)
      .mockResolvedValueOnce({ ...mockPlayer, coins: 900 } as any)
      .mockResolvedValueOnce({ id: 'player-2', coins: 200 } as any);
    const res = await request(app)
      .post('/api/economy/transfer')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newBalance).toBe(900);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('returns 400 for self-transfer', async () => {
    const res = await request(app)
      .post('/api/economy/transfer')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ fromId: 'player-1', toId: 'player-1', amount: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID');
  });

  it('returns 404 when sender not found', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/economy/transfer')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 when sender has insufficient funds', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 10 } as any);
    const res = await request(app)
      .post('/api/economy/transfer')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ fromId: 'player-1', toId: 'player-2', amount: 500 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
  });

  it('returns 400 for invalid body (missing fields)', async () => {
    const res = await request(app)
      .post('/api/economy/transfer')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ fromId: 'player-1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-positive amount', async () => {
    const res = await request(app)
      .post('/api/economy/transfer')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ fromId: 'player-1', toId: 'player-2', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 403 with JWT token instead of service token', async () => {
    const res = await request(app)
      .post('/api/economy/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/economy/adjust
// ---------------------------------------------------------------------------
describe('POST /api/economy/adjust', () => {
  const validBody = { playerId: 'player-1', currency: 'coins', delta: 50, reason: 'manual adjustment' };

  it('adjusts player balance with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(mockPlayer as any);
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ ...mockPlayer, coins: 1050 } as any);
    vi.mocked(prisma.economyAuditLog.create).mockResolvedValueOnce({} as any);
    const res = await request(app)
      .post('/api/economy/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.playerId).toBe('player-1');
    expect(res.body.currency).toBe('coins');
    expect(res.body.newBalance).toBe(1050);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('adjusts crystals balance', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(mockPlayer as any);
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ ...mockPlayer, crystals: 150 } as any);
    vi.mocked(prisma.economyAuditLog.create).mockResolvedValueOnce({} as any);
    const res = await request(app)
      .post('/api/economy/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-1', currency: 'crystals', delta: 100, reason: 'bonus crystals' });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('crystals');
    expect(res.body.newBalance).toBe(150);
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .post('/api/economy/adjust')
      .set('Authorization', `Bearer ${modToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/economy/adjust').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 when player not found', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/economy/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 when delta would make balance negative', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ ...mockPlayer, coins: 10, crystals: 0 } as any);
    const res = await request(app)
      .post('/api/economy/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-1', currency: 'coins', delta: -100, reason: 'penalty' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/economy/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid currency', async () => {
    const res = await request(app)
      .post('/api/economy/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: 'player-1', currency: 'gems', delta: 50, reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('creates audit log on successful adjust', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(mockPlayer as any);
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ ...mockPlayer, coins: 1050 } as any);
    const mockAuditLog = { id: 'log-1' };
    vi.mocked(prisma.economyAuditLog.create).mockResolvedValueOnce(mockAuditLog as any);
    await request(app)
      .post('/api/economy/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(prisma.economyAuditLog.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/economy/plugin/credit
// ---------------------------------------------------------------------------
describe('POST /api/economy/plugin/credit', () => {
  const validBody = { playerId: 'player-1', currency: 'coins', amount: 100, reason: 'quest reward' };

  it('credits player with service token (no JWT needed)', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(mockPlayer as any);
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ ...mockPlayer, coins: 1100 } as any);
    vi.mocked(prisma.economyAuditLog.create).mockResolvedValueOnce({} as any);
    const res = await request(app)
      .post('/api/economy/plugin/credit')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.playerId).toBe('player-1');
    expect(res.body.currency).toBe('coins');
    expect(res.body.newBalance).toBe(1100);
  });

  it('credits crystals', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(mockPlayer as any);
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ ...mockPlayer, crystals: 150 } as any);
    vi.mocked(prisma.economyAuditLog.create).mockResolvedValueOnce({} as any);
    const res = await request(app)
      .post('/api/economy/plugin/credit')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', currency: 'crystals', amount: 100, reason: 'crystal event' });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('crystals');
  });

  it('returns 404 when player not found', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/economy/plugin/credit')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 with JWT token instead of service token', async () => {
    const res = await request(app)
      .post('/api/economy/plugin/credit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 for non-positive amount', async () => {
    const res = await request(app)
      .post('/api/economy/plugin/credit')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', currency: 'coins', amount: 0, reason: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing reason', async () => {
    const res = await request(app)
      .post('/api/economy/plugin/credit')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'player-1', currency: 'coins', amount: 100 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/economy/market/listings
// ---------------------------------------------------------------------------
describe('GET /api/economy/market/listings', () => {
  const mockListings = [
    { id: 'listing-1', sellerId: 'player-1', material: 'DIAMOND', amount: 5, price: 100, createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    { id: 'listing-2', sellerId: 'player-2', material: 'IRON', amount: 64, price: 50, createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86_400_000) },
  ];

  it('returns paginated listings with JWT token', async () => {
    vi.mocked(prisma.marketListing.count).mockResolvedValueOnce(2);
    vi.mocked(prisma.marketListing.findMany).mockResolvedValueOnce(mockListings as any);
    const res = await request(app)
      .get('/api/economy/market/listings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/economy/market/listings');
    expect(res.status).toBe(401);
  });

  it('paginates with custom page and limit', async () => {
    vi.mocked(prisma.marketListing.count).mockResolvedValueOnce(50);
    vi.mocked(prisma.marketListing.findMany).mockResolvedValueOnce([mockListings[0]] as any);
    const res = await request(app)
      .get('/api/economy/market/listings?page=2&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.pages).toBe(5);
    expect(prisma.marketListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });

  it('caps limit at 100', async () => {
    vi.mocked(prisma.marketListing.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.marketListing.findMany).mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/economy/market/listings?limit=999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(100);
  });

  it('works with MODERATOR token', async () => {
    vi.mocked(prisma.marketListing.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.marketListing.findMany).mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/economy/market/listings')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/economy/market/listings
// ---------------------------------------------------------------------------
describe('POST /api/economy/market/listings', () => {
  const validBody = { sellerId: 'player-1', material: 'DIAMOND', amount: 5, price: 100, fee: 10 };

  it('creates a listing with service token', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 1000 } as any);
    const createdListing = { ...mockListing };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      const tx = {
        player: { update: vi.fn().mockResolvedValue({}) },
        marketListing: { create: vi.fn().mockResolvedValue(createdListing) },
      };
      return cb(tx);
    });
    const res = await request(app)
      .post('/api/economy/market/listings')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('listing-1');
    expect(res.body.sellerId).toBe('player-1');
  });

  it('creates a listing with zero fee (no player.update call)', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 1000 } as any);
    const createdListing = { ...mockListing, fee: 0 };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      const tx = {
        player: { update: vi.fn().mockResolvedValue({}) },
        marketListing: { create: vi.fn().mockResolvedValue(createdListing) },
      };
      return cb(tx);
    });
    const res = await request(app)
      .post('/api/economy/market/listings')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ ...validBody, fee: 0 });
    expect(res.status).toBe(201);
  });

  it('returns 404 when seller not found', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/economy/market/listings')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 when seller has insufficient coins for fee', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 5 } as any);
    const res = await request(app)
      .post('/api/economy/market/listings')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
  });

  it('returns 403 with JWT token instead of service token', async () => {
    const res = await request(app)
      .post('/api/economy/market/listings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/economy/market/listings')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ sellerId: 'player-1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-positive amount', async () => {
    const res = await request(app)
      .post('/api/economy/market/listings')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ ...validBody, amount: 0 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/economy/market/listings/:id/buy
// ---------------------------------------------------------------------------
describe('POST /api/economy/market/listings/:id/buy', () => {
  const validBody = { buyerId: 'player-2' };

  it('buys a listing successfully', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce(mockListing as any);
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 500 } as any);
    const updatedListing = { ...mockListing, sold: true, buyerId: 'player-2', soldAt: new Date() };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      const tx = {
        player: { update: vi.fn().mockResolvedValue({}) },
        marketListing: { update: vi.fn().mockResolvedValue(updatedListing) },
      };
      return cb(tx);
    });
    const res = await request(app)
      .post('/api/economy/market/listings/listing-1/buy')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.sold).toBe(true);
    expect(res.body.buyerId).toBe('player-2');
  });

  it('returns 404 when listing not found', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/economy/market/listings/unknown-listing/buy')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 409 when listing is already sold', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce({ ...mockListing, sold: true } as any);
    const res = await request(app)
      .post('/api/economy/market/listings/listing-1/buy')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('returns 410 when listing has expired', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce({
      ...mockListing,
      expiresAt: new Date(Date.now() - 1000),
    } as any);
    const res = await request(app)
      .post('/api/economy/market/listings/listing-1/buy')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('GONE');
  });

  it('returns 400 when buyer is the seller', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce(mockListing as any);
    const res = await request(app)
      .post('/api/economy/market/listings/listing-1/buy')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ buyerId: 'player-1' }); // player-1 is the seller
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID');
  });

  it('returns 404 when buyer not found', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce(mockListing as any);
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/economy/market/listings/listing-1/buy')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 when buyer has insufficient funds', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce(mockListing as any);
    vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({ coins: 10 } as any); // listing price is 100
    const res = await request(app)
      .post('/api/economy/market/listings/listing-1/buy')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
  });

  it('returns 403 with JWT token instead of service token', async () => {
    const res = await request(app)
      .post('/api/economy/market/listings/listing-1/buy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing buyerId', async () => {
    const res = await request(app)
      .post('/api/economy/market/listings/listing-1/buy')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/economy/market/listings/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/economy/market/listings/:id', () => {
  it('deletes a listing with SUPER_ADMIN token', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce(mockListing as any);
    vi.mocked(prisma.marketListing.delete).mockResolvedValueOnce(mockListing as any);
    const res = await request(app)
      .delete('/api/economy/market/listings/listing-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    expect(prisma.marketListing.delete).toHaveBeenCalledWith({ where: { id: 'listing-1' } });
  });

  it('returns 403 with MODERATOR token', async () => {
    const res = await request(app)
      .delete('/api/economy/market/listings/listing-1')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/economy/market/listings/listing-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when listing not found', async () => {
    vi.mocked(prisma.marketListing.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/economy/market/listings/unknown-listing')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
