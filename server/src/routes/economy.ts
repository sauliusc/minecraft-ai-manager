import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const economyRouter = Router();

const LISTING_EXPIRY_DAYS = 7;

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'SUPER_ADMIN required', statusCode: 403 });
    return false;
  }
  return true;
}

// GET /api/economy/balance/:playerId — service token
economyRouter.get('/balance/:playerId', serviceTokenMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { playerId } = req.params as { playerId: string };
    const player = await prisma.player.findUnique({
      where: { username: playerId },
      select: { username: true, coins: true, crystals: true },
    });
    if (!player) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found', statusCode: 404 });
      return;
    }
    res.json(player);
  } catch (err) {
    next(err);
  }
});

// GET /api/economy/balances — JWT (admin overview: top earners/spenders)
economyRouter.get('/balances', authMiddleware, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [topCoins, topCrystals] = await Promise.all([
      prisma.player.findMany({
        orderBy: { coins: 'desc' },
        take: 10,
        select: { username: true, coins: true, crystals: true },
      }),
      prisma.player.findMany({
        orderBy: { crystals: 'desc' },
        take: 10,
        select: { username: true, coins: true, crystals: true },
      }),
    ]);
    res.json({ topCoins, topCrystals });
  } catch (err) {
    next(err);
  }
});

const transferSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  amount: z.number().int().positive(),
});

// POST /api/economy/transfer — service token (coins only, not crystals)
economyRouter.post('/transfer', serviceTokenMiddleware, validateBody(transferSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fromId, toId, amount } = req.body as z.infer<typeof transferSchema>;
    if (fromId === toId) {
      res.status(400).json({ error: 'INVALID', message: 'Cannot transfer to yourself', statusCode: 400 });
      return;
    }

    const sender = await prisma.player.findUnique({ where: { username: fromId }, select: { coins: true } });
    if (!sender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Sender not found', statusCode: 404 });
      return;
    }
    if (sender.coins < amount) {
      res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Insufficient Coins', statusCode: 400 });
      return;
    }

    const [updated] = await prisma.$transaction([
      prisma.player.update({ where: { username: fromId }, data: { coins: { decrement: amount } } }),
      prisma.player.update({ where: { username: toId }, data: { coins: { increment: amount } } }),
    ]);

    res.json({ success: true, newBalance: updated.coins });
  } catch (err) {
    next(err);
  }
});

const adjustSchema = z.object({
  playerId: z.string().min(1),
  currency: z.enum(['coins', 'crystals']),
  delta: z.number().int(),
  reason: z.string().min(1),
});

// POST /api/economy/adjust — JWT + SUPER_ADMIN
economyRouter.post('/adjust', authMiddleware, validateBody(adjustSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { playerId, currency, delta, reason } = req.body as z.infer<typeof adjustSchema>;
    const adminId = (req as any).user.id as string;

    const player = await prisma.player.findUnique({ where: { username: playerId } });
    if (!player) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found', statusCode: 404 });
      return;
    }

    const newValue = (player[currency] ?? 0) + delta;
    if (newValue < 0) {
      res.status(400).json({ error: 'INVALID', message: 'Balance would go negative', statusCode: 400 });
      return;
    }

    const [updated] = await prisma.$transaction([
      prisma.player.update({ where: { username: playerId }, data: { [currency]: { increment: delta } } }),
      prisma.economyAuditLog.create({ data: { adminId, targetId: playerId, delta, currency, reason } }),
    ]);

    res.json({ playerId, currency, newBalance: updated[currency] });
  } catch (err) {
    next(err);
  }
});

const pluginCreditSchema = z.object({
  playerId: z.string().min(1),
  currency: z.enum(['coins', 'crystals']),
  amount: z.number().int().positive(),
  reason: z.string().min(1),
});

// POST /api/economy/plugin/credit — service token (plugins grant coins/crystals for events/milestones)
economyRouter.post('/plugin/credit', serviceTokenMiddleware, validateBody(pluginCreditSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { playerId, currency, amount, reason } = req.body as z.infer<typeof pluginCreditSchema>;

    const player = await prisma.player.findUnique({ where: { username: playerId } });
    if (!player) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found', statusCode: 404 });
      return;
    }

    const [updated] = await prisma.$transaction([
      prisma.player.update({ where: { username: playerId }, data: { [currency]: { increment: amount } } }),
      prisma.economyAuditLog.create({ data: { adminId: 'plugin', targetId: playerId, delta: amount, currency, reason } }),
    ]);

    res.json({ playerId, currency, newBalance: updated[currency] });
  } catch (err) {
    next(err);
  }
});

// --- Market ---

const createListingSchema = z.object({
  sellerId: z.string().min(1),
  material: z.string().min(1),
  amount: z.number().int().positive(),
  price: z.number().int().positive(),
  fee: z.number().int().min(0).default(0),
});

// GET /api/economy/market/listings — JWT or service token
economyRouter.get('/market/listings', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const page = Math.max(1, Number(req.query.page ?? 1));
    const now = new Date();

    const where = { sold: false, expiresAt: { gte: now } };
    const [total, listings] = await Promise.all([
      prisma.marketListing.count({ where }),
      prisma.marketListing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, sellerId: true, material: true, amount: true, price: true, createdAt: true, expiresAt: true },
      }),
    ]);

    res.json({ data: listings, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});

// POST /api/economy/market/listings — service token
economyRouter.post('/market/listings', serviceTokenMiddleware, validateBody(createListingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sellerId, material, amount, price, fee } = req.body as z.infer<typeof createListingSchema>;

    const seller = await prisma.player.findUnique({ where: { username: sellerId }, select: { coins: true } });
    if (!seller) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found', statusCode: 404 });
      return;
    }
    if (seller.coins < fee) {
      res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Insufficient Coins for listing fee', statusCode: 400 });
      return;
    }

    const expiresAt = new Date(Date.now() + LISTING_EXPIRY_DAYS * 86_400_000);

    const listing = await prisma.$transaction(async (tx) => {
      if (fee > 0) {
        await tx.player.update({ where: { username: sellerId }, data: { coins: { decrement: fee } } });
      }
      return tx.marketListing.create({
        data: { sellerId, material, amount, price, fee, expiresAt },
      });
    });

    res.status(201).json(listing);
  } catch (err) {
    next(err);
  }
});

const buyListingSchema = z.object({
  buyerId: z.string().min(1),
});

// POST /api/economy/market/listings/:id/buy — service token
economyRouter.post('/market/listings/:id/buy', serviceTokenMiddleware, validateBody(buyListingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { buyerId } = req.body as z.infer<typeof buyListingSchema>;

    const listing = await prisma.marketListing.findUnique({ where: { id } });
    if (!listing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Listing not found', statusCode: 404 });
      return;
    }
    if (listing.sold) {
      res.status(409).json({ error: 'CONFLICT', message: 'Item already sold', statusCode: 409 });
      return;
    }
    if (listing.expiresAt < new Date()) {
      res.status(410).json({ error: 'GONE', message: 'Listing has expired', statusCode: 410 });
      return;
    }
    if (listing.sellerId === buyerId) {
      res.status(400).json({ error: 'INVALID', message: 'Cannot buy your own listing', statusCode: 400 });
      return;
    }

    const buyer = await prisma.player.findUnique({ where: { username: buyerId }, select: { coins: true } });
    if (!buyer) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Buyer not found', statusCode: 404 });
      return;
    }
    if (buyer.coins < listing.price) {
      res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Insufficient Coins', statusCode: 400 });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { username: buyerId }, data: { coins: { decrement: listing.price } } });
      await tx.player.update({ where: { username: listing.sellerId }, data: { coins: { increment: listing.price } } });
      return tx.marketListing.update({
        where: { id },
        data: { sold: true, buyerId, soldAt: new Date() },
      });
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/economy/market/listings/:id — JWT + SUPER_ADMIN
economyRouter.delete('/market/listings/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params as { id: string };
    const listing = await prisma.marketListing.findUnique({ where: { id } });
    if (!listing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Listing not found', statusCode: 404 });
      return;
    }
    await prisma.marketListing.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
