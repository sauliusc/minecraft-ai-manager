import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
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
    player: { findUnique: vi.fn(), updateMany: vi.fn() },
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
