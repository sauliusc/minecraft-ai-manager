import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const playersRouter = Router();

const CACHE_TTL = 300; // 5 minutes

const registerSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1).max(16),
});

const updateSchema = z.object({
  lastSeenAt: z.string().datetime().optional(),
  joinCount: z.number().int().min(0).optional(),
});

function engagementTier(joinCount: number): string {
  if (joinCount < 5) return 'New';
  if (joinCount < 30) return 'Regular';
  if (joinCount < 100) return 'Veteran';
  return 'Legend';
}

function withTier<T extends { joinCount: number }>(player: T) {
  return { ...player, tier: engagementTier(player.joinCount) };
}

// POST /api/players — service token auth (called by GreeterPlugin)
playersRouter.post('/', serviceTokenMiddleware, validateBody(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, username } = req.body as z.infer<typeof registerSchema>;
    const now = new Date();
    const player = await prisma.player.upsert({
      where: { id },
      update: { username, lastSeenAt: now, joinCount: { increment: 1 } },
      create: { id, username, firstJoinAt: now, lastSeenAt: now, joinCount: 1 },
    });
    // Invalidate cache on upsert
    await redis.del(`player:${id}`);
    res.status(200).json(withTier(player));
  } catch (err) {
    next(err);
  }
});

// GET /api/players — JWT auth, paginated list
playersRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const tier = typeof req.query.tier === 'string' ? req.query.tier : undefined;

    const tierFilter: Record<string, object> = {
      New: { joinCount: { lt: 5 } },
      Regular: { joinCount: { gte: 5, lt: 30 } },
      Veteran: { joinCount: { gte: 30, lt: 100 } },
      Legend: { joinCount: { gte: 100 } },
    };

    const where = {
      ...(search ? { username: { contains: search, mode: 'insensitive' as const } } : {}),
      ...(tier && tierFilter[tier] ? tierFilter[tier] : {}),
    };

    const [total, players] = await Promise.all([
      prisma.player.count({ where }),
      prisma.player.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      data: players.map(withTier),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/players/:id — JWT auth, with challenge progress + reward history
playersRouter.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const cached = await redis.get(`player:${id}`);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        progress: {
          include: { challenge: { select: { id: true, title: true, type: true, activeUntil: true } } },
          orderBy: { completedAt: 'desc' },
        },
        rewards: {
          include: { reward: { select: { id: true, name: true, type: true } } },
          orderBy: { grantedAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!player) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found', statusCode: 404 });
      return;
    }

    const result = withTier(player);
    await redis.setex(`player:${id}`, CACHE_TTL, JSON.stringify(result));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/players/:id — service token auth
playersRouter.patch('/:id', serviceTokenMiddleware, validateBody(updateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = req.body as z.infer<typeof updateSchema>;

    const update: Record<string, unknown> = {};
    if (data.lastSeenAt) update.lastSeenAt = new Date(data.lastSeenAt);
    if (data.joinCount !== undefined) update.joinCount = data.joinCount;

    const player = await prisma.player.update({
      where: { id },
      data: update,
    });

    await redis.del(`player:${id}`);
    res.json(withTier(player));
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});
