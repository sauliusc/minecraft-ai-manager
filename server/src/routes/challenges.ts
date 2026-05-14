import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const challengesRouter = Router();

const ACTIVE_CACHE_KEY = 'challenges:active';
const ACTIVE_CACHE_TTL = 60; // seconds

// ChallengeType enum values from Prisma schema
const ChallengeTypeEnum = z.enum(['BLOCK_BREAK', 'KILL_MOB', 'CRAFT_ITEM', 'TRAVEL', 'CUSTOM']);
const QuestCategoryEnum = z.enum(['DAILY', 'WEEKLY', 'SIDE']);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  type: ChallengeTypeEnum,
  difficulty: z.number().int().min(1).max(5).optional().default(1),
  config: z.record(z.unknown()),
  rewardId: z.string().optional(),
  activeFrom: z.string().datetime(),
  activeUntil: z.string().datetime(),
  assignedTo: z.array(z.string()).optional(),
  questCategory: QuestCategoryEnum.optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  config: z.record(z.unknown()).optional(),
  rewardId: z.string().optional(),
  activeFrom: z.string().datetime().optional(),
  activeUntil: z.string().datetime().optional(),
  assignedTo: z.array(z.string()).optional(),
  questCategory: QuestCategoryEnum.optional(),
});

const progressSchema = z.object({
  playerId: z.string().min(1),
  amount: z.number().int().positive(),
});

const completeSchema = z.object({
  playerId: z.string().min(1),
});

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'SUPER_ADMIN required', statusCode: 403 });
    return false;
  }
  return true;
}

async function invalidateActiveCache(): Promise<void> {
  await redis.del(ACTIVE_CACHE_KEY);
}

// GET /api/challenges — authMiddleware, paginated with filters
challengesRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    const difficultyParam = typeof req.query.difficulty === 'string' ? Number(req.query.difficulty) : undefined;

    const now = new Date();
    let statusFilter: object = {};
    if (status === 'active') {
      statusFilter = { activeFrom: { lte: now }, activeUntil: { gte: now } };
    } else if (status === 'expired') {
      statusFilter = { activeUntil: { lt: now } };
    } else if (status === 'upcoming') {
      statusFilter = { activeFrom: { gt: now } };
    }

    const where = {
      ...statusFilter,
      ...(type ? { type: type as any } : {}),
      ...(difficultyParam ? { difficulty: difficultyParam } : {}),
    };

    const [total, challenges] = await Promise.all([
      prisma.challenge.count({ where }),
      prisma.challenge.findMany({
        where,
        orderBy: { activeFrom: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      data: challenges,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/challenges/active — serviceTokenMiddleware, cached (cache bypassed when filters present)
challengesRouter.get('/active', serviceTokenMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
    const questCategory = typeof req.query.questCategory === 'string' ? req.query.questCategory : undefined;
    const hasFilters = playerId !== undefined || questCategory !== undefined;

    if (!hasFilters) {
      const cached = await redis.get(ACTIVE_CACHE_KEY);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    }

    const now = new Date();
    const where: Record<string, unknown> = {
      activeFrom: { lte: now },
      activeUntil: { gte: now },
    };

    if (questCategory) {
      where['questCategory'] = questCategory;
    }

    // Filter by playerId: return challenges assigned to this player OR assigned to nobody (empty = all players)
    if (playerId) {
      where['OR'] = [
        { assignedTo: { has: playerId } },
        { assignedTo: { isEmpty: true } },
      ];
    }

    const challenges = await prisma.challenge.findMany({ where: where as any });

    if (!hasFilters) {
      await redis.setex(ACTIVE_CACHE_KEY, ACTIVE_CACHE_TTL, JSON.stringify(challenges));
    }

    res.json(challenges);
  } catch (err) {
    next(err);
  }
});

// POST /api/challenges — authMiddleware + SUPER_ADMIN
challengesRouter.post('/', authMiddleware, validateBody(createSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const data = req.body as z.infer<typeof createSchema>;
    const challenge = await prisma.challenge.create({
      data: {
        title: data.title,
        description: data.description,
        type: data.type as any,
        difficulty: data.difficulty ?? 1,
        config: data.config as any,
        rewardId: data.rewardId,
        activeFrom: new Date(data.activeFrom),
        activeUntil: new Date(data.activeUntil),
        assignedTo: data.assignedTo ?? [],
        ...(data.questCategory !== undefined ? { questCategory: data.questCategory as any } : {}),
      },
    });
    await invalidateActiveCache();
    res.status(201).json(challenge);
  } catch (err) {
    next(err);
  }
});

// GET /api/challenges/:id — authMiddleware
challengesRouter.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        _count: {
          select: { progress: true },
        },
        progress: {
          select: { completed: true },
        },
      },
    });

    if (!challenge) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Challenge not found', statusCode: 404 });
      return;
    }

    const { _count, progress, ...rest } = challenge as any;
    const completedCount = (progress as Array<{ completed: boolean }>).filter((p) => p.completed).length;
    res.json({
      ...rest,
      progress: {
        total: _count.progress,
        completed: completedCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/challenges/:id — authMiddleware + SUPER_ADMIN
challengesRouter.patch('/:id', authMiddleware, validateBody(updateSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = req.params.id as string;
    const data = req.body as z.infer<typeof updateSchema>;

    const update: Record<string, unknown> = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.difficulty !== undefined) update.difficulty = data.difficulty;
    if (data.config !== undefined) update.config = data.config;
    if (data.rewardId !== undefined) update.rewardId = data.rewardId;
    if (data.activeFrom !== undefined) update.activeFrom = new Date(data.activeFrom);
    if (data.activeUntil !== undefined) update.activeUntil = new Date(data.activeUntil);
    if (data.assignedTo !== undefined) update.assignedTo = data.assignedTo;
    if (data.questCategory !== undefined) update.questCategory = data.questCategory;

    const challenge = await prisma.challenge.update({
      where: { id },
      data: update,
    });

    await invalidateActiveCache();
    res.json(challenge);
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Challenge not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

// DELETE /api/challenges/:id — authMiddleware + SUPER_ADMIN
challengesRouter.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = req.params.id as string;
    await prisma.$transaction([
      prisma.challengeProgress.deleteMany({ where: { challengeId: id } }),
      prisma.challenge.delete({ where: { id } }),
    ]);
    await invalidateActiveCache();
    res.status(204).send();
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Challenge not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

// POST /api/challenges/:id/progress — serviceTokenMiddleware
challengesRouter.post('/:id/progress', serviceTokenMiddleware, validateBody(progressSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { playerId, amount } = req.body as z.infer<typeof progressSchema>;

    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Challenge not found', statusCode: 404 });
      return;
    }

    const config = challenge.config as Record<string, unknown>;
    const targetCount = typeof config.target_count === 'number' ? config.target_count : null;

    // Upsert: increment current by amount
    const existing = await prisma.challengeProgress.findUnique({
      where: { playerId_challengeId: { playerId, challengeId: id } },
    });

    const newCurrent = (existing?.current ?? 0) + amount;
    const isCompleted = targetCount !== null ? newCurrent >= targetCount : false;

    const progress = await prisma.challengeProgress.upsert({
      where: { playerId_challengeId: { playerId, challengeId: id } },
      create: {
        playerId,
        challengeId: id,
        current: newCurrent,
        completed: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
      update: {
        current: newCurrent,
        completed: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    res.json(progress);
  } catch (err) {
    next(err);
  }
});

// POST /api/challenges/:id/complete — serviceTokenMiddleware
challengesRouter.post('/:id/complete', serviceTokenMiddleware, validateBody(completeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { playerId } = req.body as z.infer<typeof completeSchema>;

    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Challenge not found', statusCode: 404 });
      return;
    }

    // Idempotent: if already completed, return existing
    const existing = await prisma.challengeProgress.findUnique({
      where: { playerId_challengeId: { playerId, challengeId: id } },
    });

    if (existing?.completed) {
      res.json(existing);
      return;
    }

    const progress = await prisma.challengeProgress.upsert({
      where: { playerId_challengeId: { playerId, challengeId: id } },
      create: {
        playerId,
        challengeId: id,
        current: existing?.current ?? 0,
        completed: true,
        completedAt: new Date(),
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
    });

    res.json(progress);
  } catch (err) {
    next(err);
  }
});
