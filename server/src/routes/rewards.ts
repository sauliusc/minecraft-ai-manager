import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { adminActionMiddleware } from '../middleware/adminAction.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const rewardsRouter = Router();

const REWARD_TYPES = ['ITEM', 'XP', 'COMMAND', 'CURRENCY', 'MYSTERY_BOX'] as const;
const REWARD_RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;

const lootEntrySchema = z.object({
  rewardId: z.string().min(1),
  weight: z.number().int().min(1).max(100),
});

const lootTableSchema = z
  .array(lootEntrySchema)
  .min(1)
  .superRefine((entries, ctx) => {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Loot table weights must sum to 100 (got ${total})`,
      });
    }
  });

const createRewardSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(REWARD_TYPES),
    config: z.record(z.unknown()).default({}),
    rarity: z.enum(REWARD_RARITIES).optional(),
    lootTable: lootTableSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'MYSTERY_BOX' && !data.lootTable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lootTable'],
        message: 'lootTable is required for MYSTERY_BOX rewards',
      });
    }
    if (data.type !== 'MYSTERY_BOX' && data.lootTable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lootTable'],
        message: 'lootTable is only valid for MYSTERY_BOX rewards',
      });
    }
  });

const updateRewardSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.enum(REWARD_TYPES).optional(),
    config: z.record(z.unknown()).optional(),
    rarity: z.enum(REWARD_RARITIES).optional(),
    lootTable: lootTableSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'MYSTERY_BOX' && data.lootTable === undefined) {
      // Only validate if both type and lootTable are present in the update
    }
    if (data.lootTable !== undefined && data.type !== undefined && data.type !== 'MYSTERY_BOX') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lootTable'],
        message: 'lootTable is only valid for MYSTERY_BOX rewards',
      });
    }
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
    const secret = process.env.BRIDGE_SECRET;
    if (!url || !secret) return false;
    const res = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-secret': secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Picks a weighted-random reward from a mystery box loot table.
 *
 * Returns null when the box cannot produce anything deliverable: no loot table,
 * an empty one, or every entry pointing at a reward that has since been deleted
 * (or at another MYSTERY_BOX, which the plugin cannot deliver either). Callers
 * must treat null as an error rather than falling back to granting the box
 * itself — the delivery plugin has no MYSTERY_BOX case and would drop it.
 */
async function rollLootTable(
  lootTable: unknown
): Promise<{ id: string; type: string; rarity: string | null; config: unknown } | null> {
  if (!Array.isArray(lootTable) || lootTable.length === 0) return null;

  const entries = (lootTable as Array<{ rewardId?: string; weight?: number }>).filter(
    (e) => typeof e?.rewardId === 'string' && Number(e.weight) > 0
  ) as Array<{ rewardId: string; weight: number }>;
  if (entries.length === 0) return null;

  // Only entries that resolve to a deliverable reward are eligible, so a deleted
  // or nested-box entry costs that roll nothing instead of voiding the grant.
  const candidates = await prisma.reward.findMany({
    where: { id: { in: entries.map((e) => e.rewardId) }, type: { not: 'MYSTERY_BOX' as any } },
  });
  const byId = new Map(candidates.map((r: any) => [r.id, r]));
  const eligible = entries.filter((e) => byId.has(e.rewardId));
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  let wonEntry = eligible[0]!;
  for (const entry of eligible) {
    roll -= entry.weight;
    if (roll <= 0) { wonEntry = entry; break; }
  }
  return byId.get(wonEntry.rewardId) as any;
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
rewardsRouter.post('/', authMiddleware, adminActionMiddleware({ resource: 'reward' }), validateBody(createRewardSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const data = req.body as z.infer<typeof createRewardSchema>;
    const reward = await prisma.reward.create({
      data: {
        name: data.name,
        type: data.type as any,
        config: data.config as any,
        ...(data.rarity !== undefined ? { rarity: data.rarity as any } : {}),
        ...(data.lootTable !== undefined ? { lootTable: data.lootTable as any } : {}),
      },
    });
    res.status(201).json(reward);
  } catch (err) {
    next(err);
  }
});

// GET /api/rewards/pending/:playerId — serviceTokenMiddleware
// Only returns undelivered rewards (deliveredAt IS NULL) to prevent re-delivery on every login
rewardsRouter.get('/pending/:playerId', serviceTokenMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const playerId = req.params.playerId as string;
    const records = await prisma.playerReward.findMany({
      where: { playerId, deliveredAt: null },
      orderBy: { grantedAt: 'desc' },
      take: 10,
      include: { reward: true },
    });

    // Exclude MYSTERY_BOX records — their inner rewards are stored as separate PlayerReward rows
    const result = records
      .filter((r: any) => r.reward.type !== 'MYSTERY_BOX')
      .map((r: any) => ({
        id: r.id,
        rewardId: r.rewardId,
        rewardName: r.reward.name,
        rewardType: r.reward.type,
        rarity: r.reward.rarity ?? null,
        config: r.reward.config,
      }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/rewards/:grantId/delivered — serviceTokenMiddleware
// Plugin calls this after successfully delivering a reward to stamp deliveredAt
rewardsRouter.patch('/:grantId/delivered', serviceTokenMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const grantId = req.params.grantId as string;
    await prisma.playerReward.update({
      where: { id: grantId },
      data: { deliveredAt: new Date() },
    });
    res.status(204).send();
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reward grant not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

// POST /api/rewards/grant — authMiddleware
rewardsRouter.post('/grant', authMiddleware, validateBody(grantSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { playerId: requestedPlayerId, rewardId, reason } = req.body as z.infer<typeof grantSchema>;
    const user = (req as any).user;

    // Fetch reward first
    const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
    if (!reward) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reward not found', statusCode: 404 });
      return;
    }

    // PlayerReward.playerId is a foreign key onto Player.username, so a name with no
    // row makes the grant insert throw a raw FK error (500). Resolve it up front, and
    // case-insensitively: usernames are stored case-preserved but Minecraft treats
    // them case-insensitively, so "nataszombis" must find "NatasZombis".
    const player = await prisma.player.findFirst({
      where: { username: { equals: requestedPlayerId, mode: 'insensitive' } },
      select: { username: true },
    });
    if (!player) {
      res.status(404).json({
        error: 'PLAYER_NOT_FOUND',
        message: `No player named "${requestedPlayerId}" — they must join the server at least once first`,
        statusCode: 404,
      });
      return;
    }
    // Use the canonical spelling from here on so every write matches the FK exactly.
    const playerId = player.username;

    // Redis idempotency lock — 60 s covers bridge timeout + DB write; prevents duplicate grants on retry
    const lockKey = `bridge:lock:grant:${playerId}:${rewardId}`;
    const lockResult = await redis.set(lockKey, '1', 'EX', 60, 'NX');
    if (lockResult === null) {
      res.status(409).json({ error: 'CONFLICT', message: 'Duplicate grant in progress' });
      return;
    }

    // For MYSTERY_BOX: resolve loot table to a concrete reward before bridge call.
    // MYSTERY_BOX must never reach the bridge — the plugin has no case for it and
    // would drop the grant silently, so an unresolvable box is a hard error here.
    let bridgeReward: { rewardType: string; rarity: string | null; config: unknown } = {
      rewardType: (reward as any).type,
      rarity: (reward as any).rarity ?? null,
      config: reward.config,
    };
    let innerGrantId: string | null = null;

    if ((reward as any).type === 'MYSTERY_BOX') {
      const wonReward = await rollLootTable((reward as any).lootTable);
      if (!wonReward) {
        await redis.del(lockKey);
        res.status(422).json({
          error: 'UNPROCESSABLE',
          message: 'Mystery box has no usable loot table — it cannot be granted',
          statusCode: 422,
        });
        return;
      }
      bridgeReward = {
        rewardType: (wonReward as any).type,
        rarity: (wonReward as any).rarity ?? null,
        config: wonReward.config,
      };
      // Also persist the won inner reward for the player's record
      const innerGrant = await prisma.playerReward.create({
        data: { playerId, rewardId: wonReward.id, grantedBy: user.sub, grantedAt: new Date() },
      });
      innerGrantId = innerGrant.id;
    }

    // CURRENCY rewards: credit the player's coin/crystal balance in the DB immediately.
    // The clan cost check (and all balance checks) read from Postgres, so this must happen
    // server-side before the bridge call — not via the plugin.
    if (bridgeReward.rewardType === 'CURRENCY') {
      const cfg = bridgeReward.config as Record<string, number>;
      const updates: Record<string, unknown> = {};
      if (cfg.coins) updates.coins = { increment: cfg.coins };
      if (cfg.crystals) updates.crystals = { increment: cfg.crystals };
      if (Object.keys(updates).length > 0) {
        // The player is known to exist by this point, so a failure here is a real
        // error rather than the "not joined yet" case this used to swallow.
        await prisma.player.update({ where: { username: playerId }, data: updates });
      }
    }

    // Attempt live delivery first; failure means player is offline — record queued for next login
    const bridgeOk = await callBridge('/bridge/rewards/grant', {
      playerId,
      rewardId,
      ...bridgeReward,
      ...(reason ? { reason } : {}),
    });

    // Always persist for audit trail; plugin polls /pending/:playerId on join for offline delivery
    const grant = await prisma.playerReward.create({
      data: {
        playerId,
        rewardId,
        grantedBy: user.sub,
        grantedAt: new Date(),
        // Live delivery already happened, so stamp it now. The pending path only
        // returns rows with deliveredAt IS NULL; without this the won inner reward
        // of a mystery box would be handed out again on the player's next login.
        ...(bridgeOk ? { deliveredAt: new Date() } : {}),
      },
    });

    if (bridgeOk && innerGrantId) {
      await prisma.playerReward.update({
        where: { id: innerGrantId },
        data: { deliveredAt: new Date() },
      });
    }

    res.json({ grantId: grant.id, queued: !bridgeOk });
  } catch (err: any) {
    // Belt and braces: the player is checked above, but a delete racing the grant
    // should still read as "unknown player" rather than a bare 500.
    if (err?.code === 'P2003' || err?.code === 'P2025') {
      res.status(404).json({
        error: 'PLAYER_NOT_FOUND',
        message: 'Player no longer exists',
        statusCode: 404,
      });
      return;
    }
    next(err);
  }
});

// GET /api/rewards/:id — authMiddleware
rewardsRouter.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
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
rewardsRouter.patch('/:id', authMiddleware, adminActionMiddleware({ resource: 'reward' }), validateBody(updateRewardSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = req.params.id as string;
    const data = req.body as z.infer<typeof updateRewardSchema>;

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.type !== undefined) update.type = data.type;
    if (data.config !== undefined) update.config = data.config;
    if (data.rarity !== undefined) update.rarity = data.rarity;
    if (data.lootTable !== undefined) update.lootTable = data.lootTable;

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
rewardsRouter.delete('/:id', authMiddleware, adminActionMiddleware({ resource: 'reward' }), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = req.params.id as string;

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
