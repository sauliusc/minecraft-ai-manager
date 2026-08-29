import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { sellValue } from '../routes/shop.js';
import { signAccess } from '../lib/jwt.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    shopItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    player: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    economyAuditLog: { create: vi.fn() },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
}));

vi.mock('../lib/redis.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));

import { prisma } from '../lib/prisma.js';

const SERVICE_TOKEN = 'test-bridge-secret';
const adminToken = signAccess({ sub: 'admin-1', email: 'a@test.com', role: 'SUPER_ADMIN', name: '', autoConfirm: true });
const modToken = signAccess({ sub: 'mod-1', email: 'm@test.com', role: 'MODERATOR', name: '', autoConfirm: false });

const diamond = {
  id: 'item-1', material: 'DIAMOND', displayName: null, amount: 2, price: 100,
  currency: 'coins', category: 'Resources', enabled: true, sortOrder: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BRIDGE_SECRET = SERVICE_TOKEN;
  (prisma.shopItem.findMany as any).mockResolvedValue([diamond]);
  (prisma.shopItem.findUnique as any).mockResolvedValue(diamond);
});

describe('catalogue', () => {
  it('serves only enabled items to the plugin', async () => {
    const res = await request(app).get('/api/shop/catalogue').set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(prisma.shopItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } })
    );
  });

  it('rejects the catalogue without a service token', async () => {
    expect((await request(app).get('/api/shop/catalogue')).status).toBe(403);
  });

  it('shows disabled items to the dashboard so they can be re-enabled', async () => {
    const res = await request(app).get('/api/shop').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect((prisma.shopItem.findMany as any).mock.calls[0][0]).not.toHaveProperty('where');
  });
});

describe('admin CRUD', () => {
  it('creates an item and upper-cases the material', async () => {
    (prisma.shopItem.create as any).mockResolvedValue(diamond);

    const res = await request(app)
      .post('/api/shop')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ material: 'diamond', amount: 2, price: 100 });

    expect(res.status).toBe(201);
    expect(prisma.shopItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ material: 'DIAMOND' }) })
    );
  });

  it('refuses a non-admin', async () => {
    const res = await request(app)
      .post('/api/shop')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ material: 'DIAMOND', amount: 1, price: 10 });

    expect(res.status).toBe(403);
    expect(prisma.shopItem.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a free item', { material: 'DIAMOND', amount: 1, price: 0 }],
    ['a negative price', { material: 'DIAMOND', amount: 1, price: -5 }],
    ['more than a stack', { material: 'DIAMOND', amount: 65, price: 10 }],
    ['a material with spaces', { material: 'DIAMOND SWORD', amount: 1, price: 10 }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app)
      .post('/api/shop')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('updates a price', async () => {
    (prisma.shopItem.update as any).mockResolvedValue({ ...diamond, price: 250 });

    const res = await request(app)
      .patch('/api/shop/item-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 250 });

    expect(res.status).toBe(200);
    expect(res.body.price).toBe(250);
  });

  it('404s when editing something that does not exist', async () => {
    (prisma.shopItem.findUnique as any).mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/shop/nope')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 5 });

    expect(res.status).toBe(404);
    expect(prisma.shopItem.update).not.toHaveBeenCalled();
  });

  it('deletes an item', async () => {
    const res = await request(app)
      .delete('/api/shop/item-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
    expect(prisma.shopItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });
});

describe('purchase', () => {
  /** Runs the route's transaction callback against a stubbed tx client. */
  function withTx(debitCount: number, after = { coins: 50, crystals: 0 }) {
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        player: {
          updateMany: vi.fn().mockResolvedValue({ count: debitCount }),
          findUnique: vi.fn().mockResolvedValue(after),
        },
        economyAuditLog: { create: vi.fn().mockResolvedValue({}) },
      })
    );
  }

  it('debits the price and reports what to give the player', async () => {
    withTx(1, { coins: 50, crystals: 0 });

    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'ADASGAME', itemId: 'item-1' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ material: 'DIAMOND', amount: 2, price: 100, balance: 50 });
  });

  it('debits conditionally, so two racing buys cannot overdraw', async () => {
    let seen: any = null;
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        player: {
          updateMany: vi.fn().mockImplementation(async (args: any) => { seen = args; return { count: 1 }; }),
          findUnique: vi.fn().mockResolvedValue({ coins: 50, crystals: 0 }),
        },
        economyAuditLog: { create: vi.fn().mockResolvedValue({}) },
      })
    );

    await request(app).post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'ADASGAME', itemId: 'item-1' });

    // The affordability check is part of the UPDATE's WHERE clause rather than
    // a separate read, so a losing racer updates 0 rows instead of overdrawing.
    expect(seen.where).toEqual({ username: 'ADASGAME', coins: { gte: 100 } });
    expect(seen.data).toEqual({ coins: { decrement: 100 } });
  });

  it('multiplies price and amount by the quantity', async () => {
    let seen: any = null;
    (prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        player: {
          updateMany: vi.fn().mockImplementation(async (args: any) => { seen = args; return { count: 1 }; }),
          findUnique: vi.fn().mockResolvedValue({ coins: 200, crystals: 0 }),
        },
        economyAuditLog: { create: vi.fn().mockResolvedValue({}) },
      })
    );

    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'ADASGAME', itemId: 'item-1', quantity: 8 });

    // 2 items at 100 each, times 8.
    expect(res.body).toMatchObject({ amount: 16, price: 800 });
    expect(seen.where).toEqual({ username: 'ADASGAME', coins: { gte: 800 } });
    expect(seen.data).toEqual({ coins: { decrement: 800 } });
  });

  it('defaults to a quantity of one when none is given', async () => {
    withTx(1);

    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'ADASGAME', itemId: 'item-1' });

    expect(res.body).toMatchObject({ amount: 2, price: 100 });
  });

  it.each([0, -1, 65, 1.5])('rejects a quantity of %s', async (quantity) => {
    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'ADASGAME', itemId: 'item-1', quantity });

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prices from the catalogue, so a request cannot name its own price', async () => {
    withTx(1);

    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'ADASGAME', itemId: 'item-1', quantity: 1, price: 1, amount: 999 });

    expect(res.body).toMatchObject({ amount: 2, price: 100 });
  });

  it('reports the total, not the unit price, when funds fall short', async () => {
    withTx(0);
    (prisma.player.findUnique as any).mockResolvedValue({ username: 'bladrobe', coins: 50, crystals: 0 });

    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'bladrobe', itemId: 'item-1', quantity: 8 });

    expect(res.status).toBe(402);
    expect(res.body.price).toBe(800);
  });

  it('402s when the player cannot afford it, without charging them', async () => {
    withTx(0);
    (prisma.player.findUnique as any).mockResolvedValue({ username: 'bladrobe', coins: 50, crystals: 0 });

    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'bladrobe', itemId: 'item-1' });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'INSUFFICIENT_FUNDS', price: 100, balance: 50 });
  });

  it('404s for an unknown player rather than reporting no funds', async () => {
    withTx(0);
    (prisma.player.findUnique as any).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'ghost', itemId: 'item-1' });

    expect(res.status).toBe(404);
  });

  it('refuses to sell a disabled item', async () => {
    (prisma.shopItem.findUnique as any).mockResolvedValue({ ...diamond, enabled: false });

    const res = await request(app)
      .post('/api/shop/purchase')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ playerId: 'ADASGAME', itemId: 'item-1' });

    expect(res.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cannot be called without a service token', async () => {
    const res = await request(app)
      .post('/api/shop/purchase')
      .send({ playerId: 'ADASGAME', itemId: 'item-1' });

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('sellValue', () => {
  it('is half the buy price, floored', () => {
    expect(sellValue(100, 1, 1)).toBe(50);
    expect(sellValue(100, 1, 4)).toBe(200);
    expect(sellValue(3, 1, 64)).toBe(96);      // the live 3-coin blocks
  });

  it('never pays more than half, so buying and selling cannot mint coins', () => {
    // The whole safety property: a round trip must always lose money.
    for (let price = 1; price <= 200; price++) {
      for (const count of [1, 7, 8, 64, 100]) {
        for (const amount of [1, 2, 8, 16]) {
          const buy = (price * count) / amount;
          expect(sellValue(price, amount, count)).toBeLessThan(buy);
        }
      }
    }
  });

  it('floors a 3-coin block to 1, not 2', () => {
    // 1.5 rounded up would make a single block break even at scale.
    expect(sellValue(3, 1, 1)).toBe(1);
  });

  it('returns 0 for anything too cheap to halve', () => {
    expect(sellValue(1, 1, 1)).toBe(0);
  });
});

describe('sell', () => {
  const sellBody = { playerId: 'ADASGAME', material: 'DIAMOND', count: 10 };

  beforeEach(() => {
    (prisma.shopItem as any).findFirst = vi.fn().mockResolvedValue(diamond);
    (prisma.player.findUnique as any).mockResolvedValue({ username: 'ADASGAME', coins: 150, crystals: 0 });
    (prisma.$transaction as any).mockResolvedValue([{ coins: 650, crystals: 0 }, {}]);
  });

  it('credits half price and reports the new balance', async () => {
    const res = await request(app)
      .post('/api/shop/sell')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(sellBody);

    expect(res.status).toBe(200);
    // 10 items of a 2-for-100 item: 100 * 10 / 2 / 2 = 250
    expect(res.body).toMatchObject({ material: 'DIAMOND', count: 10, credited: 250, balance: 650 });
  });

  it('only buys back what the shop actually sells', async () => {
    (prisma.shopItem as any).findFirst = vi.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/shop/sell')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ ...sellBody, material: 'BEDROCK' });

    expect(res.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses rather than paying nothing when half price floors to zero', async () => {
    (prisma.shopItem as any).findFirst = vi.fn().mockResolvedValue({ ...diamond, price: 1, amount: 1 });

    const res = await request(app)
      .post('/api/shop/sell')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ ...sellBody, count: 1 });

    expect(res.status).toBe(422);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s for an unknown player', async () => {
    (prisma.player.findUnique as any).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/shop/sell')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(sellBody);

    expect(res.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cannot be called without a service token', async () => {
    const res = await request(app).post('/api/shop/sell').send(sellBody);

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([0, -5, 5000])('rejects a count of %s', async (count) => {
    const res = await request(app)
      .post('/api/shop/sell')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send({ ...sellBody, count });

    expect(res.status).toBe(400);
  });
});
