import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { adminActionMiddleware } from '../middleware/adminAction.middleware.js';
import {
  getAiConfig,
  setAiConfig,
  generateChallengeDrafts,
  runEngagementScan,
  suggestRewards,
  scanChatMessages,
} from '../services/ai.js';

const router = Router();
router.use(authMiddleware);

const prisma = new PrismaClient();

function isSuperAdmin(req: Request): boolean {
  return (req as Request & { user: { role: string } }).user?.role === 'SUPER_ADMIN';
}

// ── Settings ──────────────────────────────────────────────────────────────────

const MASKED = '••••••••';
const API_KEY_FIELDS = ['api_key', 'openrouter_api_key', 'gemini_api_key'] as const;

router.get('/config', async (_req: Request, res: Response): Promise<void> => {
  const cfg = await getAiConfig();
  const safe = { ...cfg };
  for (const field of API_KEY_FIELDS) {
    safe[field] = cfg[field] ? MASKED : '';
  }
  res.json({ data: safe });
});

router.put('/config', adminActionMiddleware({ resource: 'ai' }), async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }
  const updates = req.body as Record<string, string>;
  for (const field of API_KEY_FIELDS) {
    if (updates[field] === MASKED) delete updates[field];
  }
  await setAiConfig(updates);
  res.json({ ok: true });
});

// ── Challenge Generator ───────────────────────────────────────────────────────

router.post('/challenges/generate', adminActionMiddleware({ resource: 'ai' }), async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }
  try {
    const themeHint: string = (req.body as { theme?: string }).theme ?? '';

    const [existingChallenges, analyticsData] = await Promise.all([
      prisma.challenge.findMany({ select: { title: true }, orderBy: { activeFrom: 'desc' }, take: 30 }),
      prisma.challengeProgress.groupBy({
        by: ['challengeId'],
        _count: { completed: true },
        where: { completed: true },
      }),
    ]);

    const existingTitles = existingChallenges.map((c) => c.title);
    const analyticsSnapshot = `Total challenge completions recorded: ${analyticsData.length} challenges with at least one completion.`;

    const drafts = await generateChallengeDrafts(themeHint, existingTitles, analyticsSnapshot);

    const created = await Promise.all(
      drafts.map((d) =>
        prisma.aiChallengeDraft.create({
          data: { payload: d.payload as never, confidence: d.confidence, reasoning: d.reasoning },
        })
      )
    );

    res.json({ data: created, count: created.length });
  } catch (err) {
    res.status(500).json({ error: 'AI_ERROR', message: String(err) });
  }
});

router.get('/challenges/drafts', async (_req: Request, res: Response): Promise<void> => {
  const drafts = await prisma.aiChallengeDraft.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ data: drafts });
});

router.post('/challenges/drafts/:id/approve', adminActionMiddleware({ resource: 'ai' }), async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }
  const draft = await prisma.aiChallengeDraft.findUnique({ where: { id: String(req.params.id) } });
  if (!draft || draft.status !== 'PENDING') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Draft not found or already reviewed' });
    return;
  }

  const payload = draft.payload as {
    title: string; description: string; type: string; difficulty: number;
    config: Record<string, unknown>; questCategory: string; activeFrom: string; activeUntil: string;
  };

  const [challenge] = await Promise.all([
    prisma.challenge.create({
      data: {
        title: payload.title,
        description: payload.description,
        type: payload.type as never,
        difficulty: payload.difficulty,
        config: payload.config as never,
        questCategory: payload.questCategory as never,
        activeFrom: new Date(payload.activeFrom),
        activeUntil: new Date(payload.activeUntil),
        assignedTo: [],
      },
    }),
    prisma.aiChallengeDraft.update({
      where: { id: draft.id },
      data: { status: 'APPROVED', reviewedBy: (req as Request & { user: { email: string } }).user.email },
    }),
  ]);

  res.json({ data: challenge });
});

router.delete('/challenges/drafts/:id', adminActionMiddleware({ resource: 'ai' }), async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }
  await prisma.aiChallengeDraft.update({
    where: { id: String(req.params.id) },
    data: { status: 'REJECTED' },
  });
  res.json({ ok: true });
});

// ── Engagement Scan ───────────────────────────────────────────────────────────

router.post('/engagement/scan', adminActionMiddleware({ resource: 'ai' }), async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }
  try {
    const cutoff14 = new Date(Date.now() - 14 * 86400_000);
    const cutoff7  = new Date(Date.now() -  7 * 86400_000);
    const prior7   = new Date(Date.now() - 14 * 86400_000);

    const activePlayers = await prisma.player.findMany({
      where: { lastSeenAt: { gte: cutoff14 } },
      take: parseInt((req.body as { limit?: string }).limit ?? '100'),
      orderBy: { lastSeenAt: 'desc' },
    });

    const recentCompletionsBatch = await prisma.challengeProgress.groupBy({
      by: ['playerId'],
      _count: { completed: true },
      where: { completed: true, completedAt: { gte: cutoff7 } },
    });

    const priorCompletionsBatch = await prisma.challengeProgress.groupBy({
      by: ['playerId'],
      _count: { completed: true },
      where: { completed: true, completedAt: { gte: prior7, lt: cutoff7 } },
    });

    const recentMap = Object.fromEntries(recentCompletionsBatch.map((r) => [r.playerId, r._count.completed]));
    const priorMap  = Object.fromEntries(priorCompletionsBatch.map((r) => [r.playerId, r._count.completed]));

    const lastRewards = await prisma.playerReward.groupBy({
      by: ['playerId'],
      _max: { grantedAt: true },
      where: { playerId: { in: activePlayers.map((p) => p.username) } },
    });
    const lastRewardMap = Object.fromEntries(lastRewards.map((r) => [r.playerId, r._max.grantedAt]));

    const playerInputs = activePlayers.map((p) => {
      const lastRewardDate = lastRewardMap[p.username];
      const daysSinceReward = lastRewardDate
        ? Math.floor((Date.now() - new Date(lastRewardDate).getTime()) / 86400_000)
        : 999;
      return {
        uuid: p.username,
        username: p.username,
        recentLogins: Math.min(p.joinCount, 14),
        baselineLogins: Math.max(Math.round(p.joinCount / 4), 1),
        recentCompletions: recentMap[p.username] ?? 0,
        priorCompletions: priorMap[p.username] ?? 0,
        currentStreak: p.currentStreak,
        longestStreak: p.longestStreak,
        daysSinceReward,
      };
    });

    const results = await runEngagementScan(playerInputs);
    const scan = await prisma.aiEngagementScan.create({ data: { results: results as never } });

    res.json({ data: scan });
  } catch (err) {
    res.status(500).json({ error: 'AI_ERROR', message: String(err) });
  }
});

router.get('/engagement/latest', async (_req: Request, res: Response): Promise<void> => {
  const scan = await prisma.aiEngagementScan.findFirst({ orderBy: { scannedAt: 'desc' } });
  res.json({ data: scan ?? null });
});

// ── Reward Suggestions ────────────────────────────────────────────────────────

router.post('/rewards/suggest', async (req: Request, res: Response): Promise<void> => {
  const { playerUuid } = req.body as { playerUuid?: string };
  if (!playerUuid) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'playerUuid is required' });
    return;
  }
  try {
    const [player, recentRewards, topChallenges, cosmetics, catalogue] = await Promise.all([
      prisma.player.findUnique({ where: { username: playerUuid } }),
      prisma.playerReward.findMany({
        where: { playerId: playerUuid },
        include: { reward: { select: { type: true } } },
        orderBy: { grantedAt: 'desc' },
        take: 10,
      }),
      prisma.challengeProgress.findMany({
        where: { playerId: playerUuid, completed: true },
        include: { challenge: { select: { type: true } } },
        take: 50,
      }),
      prisma.playerCosmetics.findUnique({ where: { playerId: playerUuid } }),
      prisma.reward.findMany({ select: { id: true, name: true, type: true, rarity: true } }),
    ]);

    if (!player) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
      return;
    }

    const joinCount = player.joinCount;
    const tier = joinCount >= 100 ? 'Legend' : joinCount >= 30 ? 'Veteran' : joinCount >= 5 ? 'Regular' : 'New';

    const typeCounts: Record<string, number> = {};
    for (const cp of topChallenges) {
      typeCounts[cp.challenge.type] = (typeCounts[cp.challenge.type] ?? 0) + 1;
    }
    const topChallengeTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

    const equippedCosmetics = [
      cosmetics?.titleId && `title:${cosmetics.titleId}`,
      cosmetics?.chatColor && `color:${cosmetics.chatColor}`,
      cosmetics?.petType && `pet:${cosmetics.petType}`,
    ].filter(Boolean) as string[];

    const suggestions = await suggestRewards(
      {
        uuid: playerUuid,
        username: player.username,
        tier,
        currentStreak: player.currentStreak,
        coins: player.coins,
        crystals: player.crystals,
        topChallengeTypes,
        recentRewardTypes: recentRewards.map((r) => r.reward.type),
        equippedCosmetics,
      },
      catalogue
    );

    res.json({ data: suggestions });
  } catch (err) {
    res.status(500).json({ error: 'AI_ERROR', message: String(err) });
  }
});

// ── Chat Moderation Scanner ───────────────────────────────────────────────────

router.post('/moderation/scan', adminActionMiddleware({ resource: 'ai' }), async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }
  try {
    const limit = Math.min(parseInt((req.body as { limit?: string }).limit ?? '50'), 200);

    const logs = await prisma.chatLog.findMany({
      where: { flagged: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (logs.length === 0) {
      res.json({ data: { results: [] } });
      return;
    }

    // Build per-player context (last 3 messages before this one)
    const byPlayer: Record<string, string[]> = {};
    const inputs = logs.map((log) => {
      const ctx = byPlayer[log.playerId] ? [...byPlayer[log.playerId]] : [];
      byPlayer[log.playerId] = [...ctx, log.message].slice(-3);
      return { id: log.id, playerId: log.playerId, username: log.username, message: log.message, context: ctx };
    });

    const results = await scanChatMessages(inputs);
    const scan = await prisma.aiChatScan.create({ data: { results: results as never } });

    res.json({ data: scan });
  } catch (err) {
    res.status(500).json({ error: 'AI_ERROR', message: String(err) });
  }
});

router.get('/moderation/latest', async (_req: Request, res: Response): Promise<void> => {
  const scan = await prisma.aiChatScan.findFirst({ orderBy: { scannedAt: 'desc' } });
  res.json({ data: scan ?? null });
});

// Flag a chat log entry (admin-triggered from AI scan results)
router.post('/moderation/flag/:logId', adminActionMiddleware({ resource: 'ai' }), async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requires SUPER_ADMIN' });
    return;
  }
  await prisma.chatLog.update({ where: { id: String(req.params.logId) }, data: { flagged: true } });
  res.json({ ok: true });
});

export { router as aiRouter };
