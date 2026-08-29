import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { adminActionMiddleware } from '../middleware/adminAction.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const shopRouter = Router();

const CURRENCIES = ['coins', 'crystals'] as const;

/**
 * Minecraft material names, e.g. DIAMOND or GOLDEN_APPLE. Validated loosely
 * here — the API has no material list to check against — and strictly by the
 * plugin, which rejects anything Material.matchMaterial cannot resolve and says
 * so in the dashboard-visible log rather than handing the player nothing.
 */
const materialSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_]+$/, 'Material must be a Minecraft material name, e.g. DIAMOND');

const createSchema = z.object({
  material: materialSchema,
  displayName: z.string().min(1).max(64).nullish(),
  amount: z.number().int().min(1).max(64),
  price: z.number().int().min(1),
  currency: z.enum(CURRENCIES).default('coins'),
  category: z.string().min(1).max(32).default('General'),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const updateSchema = createSchema.partial();

function requireAdmin(req: Request, res: Response): boolean {
  if ((req as any).user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN', statusCode: 403 });
    return false;
  }
  return true;
}

// GET /api/shop — dashboard listing (every item, including disabled ones)
shopRouter.get('/', authMiddleware, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.shopItem.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { price: 'asc' }],
    });
    res.json({ data: items });
  } catch (err) { next(err); }
});

// GET /api/shop/catalogue — service token; what the in-game shop shows
shopRouter.get('/catalogue', serviceTokenMiddleware, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.shopItem.findMany({
      where: { enabled: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { price: 'asc' }],
    });
    res.json({ data: items });
  } catch (err) { next(err); }
});

// POST /api/shop — create (SUPER_ADMIN)
shopRouter.post('/', authMiddleware, adminActionMiddleware({ resource: 'shop' }), validateBody(createSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const data = req.body as z.infer<typeof createSchema>;
    const item = await prisma.shopItem.create({
      data: { ...data, material: data.material.toUpperCase() },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

// PATCH /api/shop/:id — edit price, stock size, availability (SUPER_ADMIN)
shopRouter.patch('/:id', authMiddleware, adminActionMiddleware({ resource: 'shop' }), validateBody(updateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const data = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.shopItem.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Shop item not found', statusCode: 404 });
      return;
    }
    const item = await prisma.shopItem.update({
      where: { id: String(req.params.id) },
      data: { ...data, ...(data.material ? { material: data.material.toUpperCase() } : {}) },
    });
    res.json(item);
  } catch (err) { next(err); }
});

// DELETE /api/shop/:id (SUPER_ADMIN)
shopRouter.delete('/:id', authMiddleware, adminActionMiddleware({ resource: 'shop' }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const existing = await prisma.shopItem.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Shop item not found', statusCode: 404 });
      return;
    }
    await prisma.shopItem.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  } catch (err) { next(err); }
});

/** Multiples the in-game picker offers; anything in range is accepted. */
const MAX_QUANTITY = 64;

const purchaseSchema = z.object({
  playerId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_QUANTITY).default(1),
});

/**
 * POST /api/shop/purchase — service token; the plugin calls this before giving
 * anything to the player.
 *
 * The debit is conditional inside a transaction: updateMany with a
 * `price <= balance` filter returns a count, so two simultaneous purchases
 * cannot both pass a read-then-write check and overdraw the account. The
 * plugin hands over the item only once this responds 200, so a failure here
 * costs the player nothing.
 */
shopRouter.post('/purchase', serviceTokenMiddleware, validateBody(purchaseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { playerId, itemId, quantity } = req.body as z.infer<typeof purchaseSchema>;

    const item = await prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!item || !item.enabled) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Item is not for sale', statusCode: 404 });
      return;
    }

    const currency = item.currency === 'crystals' ? 'crystals' : 'coins';
    // Both totals come from the catalogue row, never from the request: the
    // caller supplies only how many, so it cannot name its own price.
    const totalPrice = item.price * quantity;
    const totalAmount = item.amount * quantity;

    const result = await prisma.$transaction(async (tx) => {
      const debited = await tx.player.updateMany({
        where: { username: playerId, [currency]: { gte: totalPrice } },
        data: { [currency]: { decrement: totalPrice } },
      });
      if (debited.count === 0) return null;

      await tx.economyAuditLog.create({
        data: {
          adminId: 'shop',
          targetId: playerId,
          delta: -totalPrice,
          currency,
          reason: `shop_purchase:${item.material}x${totalAmount}`,
        },
      });
      return tx.player.findUnique({ where: { username: playerId }, select: { coins: true, crystals: true } });
    });

    if (!result) {
      // Either the player does not exist or they cannot afford it. Both are a
      // refusal to sell, and neither should have moved any money.
      const player = await prisma.player.findUnique({ where: { username: playerId } });
      if (!player) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found', statusCode: 404 });
        return;
      }
      res.status(402).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Not enough ${currency}`,
        statusCode: 402,
        price: totalPrice,
        balance: (player as any)[currency],
      });
      return;
    }

    res.json({
      material: item.material,
      amount: totalAmount,
      price: totalPrice,
      currency,
      balance: (result as any)[currency],
    });
  } catch (err) { next(err); }
});
