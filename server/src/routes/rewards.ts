import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const rewardsRouter = Router();

const createRewardSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['ITEM', 'XP', 'COMMAND', 'CURRENCY']),
  config: z.record(z.unknown()),
  rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']).optional(),
});

const updateRewardSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['ITEM', 'XP', 'COMMAND', 'CURRENCY']).optional(),
  config: z.record(z.unknown()).optional(),
  rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']).optional(),
});

const grantSchema = z.object({
  playerId: z.string().min(1),
  rewardId: z.string().min(1),
  reason: z.string().optional(),
});

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'SUPER_ADMIN required', statusCode: 403 });
    return false;
  }
  return true;
}

async function callBridge(path: string, body: object): Promise<boolean> {
  try {
    const url = process.env.MINECRAFT_BRIDGE_URL;
    const secret = process.env.MINECRAFT_BRIDGE_SECRET;
    if (!url || !secret) return false;
    const res = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// GET /api/rewards — authMiddleware, paginated with optional type filter
rewardsRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;

    const where = {
      ...(type ? { type: type as any } : {}),
    };

    const [total, rewards] = await Promise.all([
      prisma.reward.count({ where }),
      prisma.reward.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      data: rewards,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rewards — authMiddleware + SUPER_ADMIN
rewardsRouter.post('/', authMiddleware, validateBody(createRewardSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const data = req.body as z.infer<typeof createRewardSchema>;
    const reward = await prisma.reward.create({
      data: {
        name: data.name,
        type: data.type as any,
        config: data.config,
        ...(data.rarity !== undefined ? { rarity: data.rarity } : {}),
      },
    });
    res.status(201).json(reward);
  } catch (err) {
    next(err);
  }
});

// GET /api/rewards/pending/:playerId — serviceTokenMiddleware
rewardsRouter.get('/pending/:playerId', serviceTokenMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { playerId } = req.params;
    const records = await prisma.playerReward.findMany({
      where: { playerId },
      orderBy: { grantedAt: 'desc' },
      take: 10,
      include: { reward: true },
    });

    const result = records.map((r: any) => ({
      id: r.id,
      rewardId: r.rewardId,
      rewardType: r.reward.type,
      rarity: r.reward.rarity ?? null,
      config: r.reward.config,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/rewards/grant — authMiddleware
rewardsRouter.post('/grant', authMiddleware, validateBody(grantSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { playerId, rewardId, reason } = req.body as z.infer<typeof grantSchema>;
    const user = (req as any).user;

    // Fetch reward first
    const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
    if (!reward) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reward not found', statusCode: 404 });
      return;
    }

    // Redis lock: NX EX 5
    const lockKey = `bridge:lock:grant:${playerId}:${rewardId}`;
    const lockResult = await redis.set(lockKey, '1', 'NX', 'EX', 5);
    if (lockResult === null) {
      res.status(409).json({ error: 'CONFLICT', message: 'Duplicate grant in progress' });
      return;
    }

    // Insert PlayerReward record
    const grant = await prisma.playerReward.create({
      data: {
        playerId,
        rewardId,
        grantedBy: user.sub,
        grantedAt: new Date(),
      },
    });

    // Attempt bridge call
    const bridgeOk = await callBridge('/bridge/rewards/grant', {
      playerId,
      grantId: grant.id,
      rewardId,
      rewardType: (reward as any).type,
      rarity: (reward as any).rarity ?? null,
      config: reward.config,
      ...(reason ? { reason } : {}),
    });

    res.json({ grantId: grant.id, queued: !bridgeOk });
  } catch (err) {
    next(err);
  }
});

// GET /api/rewards/:id — authMiddleware
rewardsRouter.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const reward = await prisma.reward.findUnique({
      where: { id },
      include: {
        _count: {
          select: { grants: true },
        },
      },
    });

    if (!reward) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reward not found', statusCode: 404 });
      return;
    }

    const { _count, ...rest } = reward as any;
    res.json({ ...rest, grantCount: _count.grants });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/rewards/:id — authMiddleware + SUPER_ADMIN
rewardsRouter.patch('/:id', authMiddleware, validateBody(updateRewardSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params;
    const data = req.body as z.infer<typeof updateRewardSchema>;

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.type !== undefined) update.type = data.type;
    if (data.config !== undefined) update.config = data.config;
    if (data.rarity !== undefined) update.rarity = data.rarity;

    const reward = await prisma.reward.update({
      where: { id },
      data: update,
    });

    res.json(reward);
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reward not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

// DELETE /api/rewards/:id — authMiddleware + SUPER_ADMIN
rewardsRouter.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params;

    // Check if linked to any active challenge
    const now = new Date();
    const activeChallenge = await prisma.challenge.findFirst({
      where: { rewardId: id, activeUntil: { gte: now } },
    });
    if (activeChallenge) {
      res.status(409).json({
        error: 'CONFLICT',
        message: 'Reward is linked to an active challenge and cannot be deleted',
        statusCode: 409,
      });
      return;
    }

    await prisma.reward.delete({ where: { id } });
    res.status(204).send();
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reward not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});
