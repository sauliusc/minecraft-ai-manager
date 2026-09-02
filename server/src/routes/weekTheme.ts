import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { generateWeekTheme, WeekThemePayload } from '../services/ai.js';
import { deliverBroadcast } from '../services/broadcast.js';
import { normalizeChallengeConfig, normalizeRewardConfig } from '../lib/challengeConfig.js';

const router = Router();
router.use(authMiddleware);

function isSuperAdmin(req: Request): boolean {
  return (req as Request & { user: { role: string } }).user?.role === 'SUPER_ADMIN';
}

function getUserEmail(req: Request): string {
  return (req as Request & { user: { email: string } }).user?.email ?? 'unknown';
}

/** Activation rejected because the generated payload cannot produce valid records. */
export class WeekThemeValidationError extends Error {}

/**
 * Spreads weights evenly across the given rewards, summing to exactly 100 as the
 * reward API requires. The remainder goes to the first entry so 3 rewards give
 * 34/33/33 rather than 33/33/33.
 */
export function buildLootTable(rewardIds: string[]): Array<{ rewardId: string; weight: number }> {
  const base = Math.floor(100 / rewardIds.length);
  const remainder = 100 - base * rewardIds.length;
  return rewardIds.map((rewardId, i) => ({
    rewardId,
    weight: i === 0 ? base + remainder : base,
  }));
}

// POST /api/ai/week-theme/generate  (SUPER_ADMIN)
router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }

  const { theme, startDate } = req.body as { theme?: string; startDate?: string };
  if (!theme || !startDate) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'theme and startDate are required' });
    return;
  }

  let parsedStartDate: Date;
  try {
    parsedStartDate = new Date(startDate);
    if (isNaN(parsedStartDate.getTime())) throw new Error('Invalid date');
  } catch {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'startDate must be a valid date string' });
    return;
  }

  try {
    const existingChallenges = await prisma.challenge.findMany({
      select: { title: true },
      orderBy: { activeFrom: 'desc' },
      take: 30,
    });
    const existingTitles = existingChallenges.map((c) => c.title);

    const payload = await generateWeekTheme(theme, parsedStartDate, existingTitles);

    const endDate = new Date(parsedStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const weekTheme = await prisma.weekTheme.create({
      data: {
        theme,
        description: payload.description,
        startDate: parsedStartDate,
        endDate,
        aiPayload: payload as never,
        announcementText: payload.announcementText,
        createdBy: getUserEmail(req),
      },
    });

    res.status(201).json({ data: weekTheme });
  } catch (err) {
    res.status(500).json({ error: 'AI_ERROR', message: String(err) });
  }
});

// GET /api/ai/week-theme  (paginated)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

  const [total, data] = await Promise.all([
    prisma.weekTheme.count(),
    prisma.weekTheme.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  res.json({ data, meta: { total, page, pages: Math.ceil(total / limit) } });
});

// GET /api/ai/week-theme/current  (status=ACTIVE)
router.get('/current', async (_req: Request, res: Response): Promise<void> => {
  const theme = await prisma.weekTheme.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { activatedAt: 'desc' },
  });
  res.json({ data: theme ?? null });
});

// GET /api/ai/week-theme/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const theme = await prisma.weekTheme.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!theme) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Week theme not found' });
    return;
  }
  res.json({ data: theme });
});

// POST /api/ai/week-theme/:id/activate  (SUPER_ADMIN, Prisma transaction)
router.post('/:id/activate', async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }

  const weekTheme = await prisma.weekTheme.findUnique({
    where: { id: String(req.params.id) },
  });

  if (!weekTheme) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Week theme not found' });
    return;
  }

  if (weekTheme.status !== 'DRAFT') {
    res.status(409).json({ error: 'CONFLICT', message: `Cannot activate a theme with status ${weekTheme.status}` });
    return;
  }

  const payload = weekTheme.aiPayload as unknown as WeekThemePayload;

  try {
    const updatedTheme = await prisma.$transaction(async (tx) => {
      // 1. Create GameEvent
      const gameEvent = await tx.gameEvent.create({
        data: {
          type: payload.event.type as never,
          title: payload.event.title,
          state: 'UPCOMING',
          scheduledAt: weekTheme.startDate,
          config: payload.event.config as never,
        },
      });

      // 2. Create 7 daily Challenge records
      const dailyChallengeIds: string[] = [];
      for (const dc of payload.dailyChallenges) {
        const activeFrom = new Date(
          weekTheme.startDate.getTime() + dc.dayOffset * 24 * 60 * 60 * 1000
        );
        // 23h 59m = 86340 seconds
        const activeUntil = new Date(activeFrom.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000);
        const challenge = await tx.challenge.create({
          data: {
            title: dc.title,
            description: dc.description,
            type: dc.type as never,
            difficulty: dc.difficulty,
            // Normalised on the way in: drafts generated before #360 carry keys
            // the plugin never reads, which made the challenge uncompletable.
            config: normalizeChallengeConfig(dc.type, dc.config ?? {}) as never,
            questCategory: 'DAILY',
            activeFrom,
            activeUntil,
            assignedTo: [],
          },
        });
        dailyChallengeIds.push(challenge.id);
      }

      // 3. Create weekly Challenge
      const wc = payload.weeklyChallenge;
      const weeklyChallenge = await tx.challenge.create({
        data: {
          title: wc.title,
          description: wc.description,
          type: wc.type as never,
          difficulty: wc.difficulty,
          config: normalizeChallengeConfig(wc.type, wc.config ?? {}) as never,
          questCategory: 'WEEKLY',
          activeFrom: weekTheme.startDate,
          activeUntil: weekTheme.endDate,
          assignedTo: [],
        },
      });

      // 4. Create NpcDefinition
      const npc = await tx.npcDefinition.create({
        data: {
          name: payload.npc.name,
          title: payload.npc.title,
          type: payload.npc.type as never,
          dialogueLines: payload.npc.dialogueLines,
          questIds: [],
          locWorld: 'world',
          locX: 0,
          locY: 64,
          locZ: 0,
          locYaw: 0,
        },
      });

      // 5. Create 4 Reward records.
      // Mystery boxes are created last: they need a loot table pointing at concrete
      // rewards, and without one the grant path cannot resolve them to anything
      // deliverable. The AI payload has no loot table field, so build one over the
      // plain rewards from this same batch.
      const plain = payload.rewards.filter((r) => r.type !== 'MYSTERY_BOX');
      const boxes = payload.rewards.filter((r) => r.type === 'MYSTERY_BOX');

      if (boxes.length > 0 && plain.length === 0) {
        throw new WeekThemeValidationError(
          'Generated rewards are all mystery boxes — there is nothing to put in a loot table'
        );
      }

      const rewardIds: string[] = [];
      for (const r of plain) {
        const reward = await tx.reward.create({
          data: {
            name: r.name,
            type: r.type as never,
            rarity: r.rarity as never,
            config: normalizeRewardConfig(r.type, r.config ?? {}) as never,
          },
        });
        rewardIds.push(reward.id);
      }

      const lootTable = buildLootTable(rewardIds);
      for (const r of boxes) {
        const reward = await tx.reward.create({
          data: {
            name: r.name,
            type: r.type as never,
            rarity: r.rarity as never,
            config: normalizeRewardConfig(r.type, r.config ?? {}) as never,
            lootTable: lootTable as never,
          },
        });
        rewardIds.push(reward.id);
      }

      // 6. Update WeekTheme with all created IDs
      const updated = await tx.weekTheme.update({
        where: { id: weekTheme.id },
        data: {
          status: 'ACTIVE',
          eventId: gameEvent.id,
          npcId: npc.id,
          challengeIds: [...dailyChallengeIds, weeklyChallenge.id],
          rewardIds,
          activatedAt: new Date(),
          activatedBy: getUserEmail(req),
        },
      });

      return updated;
    });

    // 7. Announce in chat (best-effort, don't fail activation if RCON is down).
    // This used to pass the prose straight to rcon.send(), which executes it as a
    // console command — the server replied "Unknown or incomplete command" and no
    // player ever saw it, while the round-trip succeeded so nothing was logged.
    if (payload.announcementText) {
      deliverBroadcast(['CHAT'], payload.announcementText, 'ALL').catch((err) => {
        console.warn('[WeekTheme] announcement failed (non-fatal):', String(err));
      });
      // TODO: Replace fire-and-forget with a proper job queue when RCON reliability is needed
    }

    res.json({ data: updatedTheme });
  } catch (err) {
    if (err instanceof WeekThemeValidationError) {
      res.status(422).json({ error: 'UNPROCESSABLE', message: err.message, statusCode: 422 });
      return;
    }
    res.status(500).json({ error: 'ACTIVATE_ERROR', message: String(err) });
  }
});

// DELETE /api/ai/week-theme/:id  (SUPER_ADMIN — set status=CANCELLED)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }

  const weekTheme = await prisma.weekTheme.findUnique({
    where: { id: String(req.params.id) },
  });

  if (!weekTheme) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Week theme not found' });
    return;
  }

  if (weekTheme.status === 'CANCELLED') {
    res.status(409).json({ error: 'CONFLICT', message: 'Theme is already cancelled' });
    return;
  }

  const updated = await prisma.weekTheme.update({
    where: { id: String(req.params.id) },
    data: { status: 'CANCELLED' },
  });

  res.json({ data: updated });
});

export { router as weekThemeRouter };
