import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const analyticsRouter = Router();

// GET /api/analytics/retention  — DAU/WAU/MAU counts
analyticsRouter.get('/retention', authMiddleware, async (_req, res, next) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [dau, wau, mau, total] = await Promise.all([
      prisma.player.count({ where: { lastSeenAt: { gte: dayAgo } } }),
      prisma.player.count({ where: { lastSeenAt: { gte: weekAgo } } }),
      prisma.player.count({ where: { lastSeenAt: { gte: monthAgo } } }),
      prisma.player.count(),
    ]);

    // New-player funnel: joined → first challenge → first reward → day-7 return
    const [newPlayers, withProgress, withReward] = await Promise.all([
      prisma.player.count({ where: { firstJoinAt: { gte: monthAgo } } }),
      prisma.player.count({
        where: {
          firstJoinAt: { gte: monthAgo },
          progress: { some: {} },
        },
      }),
      prisma.player.count({
        where: {
          firstJoinAt: { gte: monthAgo },
          rewards: { some: {} },
        },
      }),
    ]);

    res.json({
      dau, wau, mau, total,
      funnel: {
        joined: newPlayers,
        firstChallenge: withProgress,
        firstReward: withReward,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/challenges  — per-challenge performance
analyticsRouter.get('/challenges', authMiddleware, async (_req, res, next) => {
  try {
    const challenges = await prisma.challenge.findMany({
      include: {
        _count: { select: { progress: true } },
        progress: { select: { completed: true } },
      },
    });

    const data = challenges.map((ch) => {
      const total = ch._count.progress;
      const completed = ch.progress.filter((p) => p.completed).length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return {
        id: ch.id,
        title: ch.title,
        type: ch.type,
        attempts: total,
        completions: completed,
        completionRate,
        flag: completionRate < 20 ? 'TOO_HARD' : completionRate > 95 ? 'TOO_EASY' : null,
      };
    });

    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/analytics/economy  — top earners, grant counts
analyticsRouter.get('/economy', authMiddleware, async (_req, res, next) => {
  try {
    const topGrantees = await prisma.playerReward.groupBy({
      by: ['playerId'],
      _count: { playerId: true },
      orderBy: { _count: { playerId: 'desc' } },
      take: 10,
    });

    const rewardCounts = await prisma.playerReward.groupBy({
      by: ['rewardId'],
      _count: { rewardId: true },
      orderBy: { _count: { rewardId: 'desc' } },
      take: 10,
    });

    // Enrich with player usernames
    const playerIds = topGrantees.map((g) => g.playerId);
    const players = await prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, username: true },
    });
    const playerMap = Object.fromEntries(players.map((p) => [p.id, p.username]));

    // Enrich with reward names
    const rewardIds = rewardCounts.map((r) => r.rewardId);
    const rewards = await prisma.reward.findMany({
      where: { id: { in: rewardIds } },
      select: { id: true, name: true },
    });
    const rewardMap = Object.fromEntries(rewards.map((r) => [r.id, r.name]));

    res.json({
      topRecipients: topGrantees.map((g) => ({
        playerId: g.playerId,
        username: playerMap[g.playerId] ?? g.playerId,
        grantCount: g._count.playerId,
      })),
      popularRewards: rewardCounts.map((r) => ({
        rewardId: r.rewardId,
        name: rewardMap[r.rewardId] ?? r.rewardId,
        grantCount: r._count.rewardId,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/churn-risk  — players whose frequency dropped
analyticsRouter.get('/churn-risk', authMiddleware, async (_req, res, next) => {
  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000);
    const fourWeeksAgo = new Date(Date.now() - 28 * 86_400_000);

    // Players who were active in the prior 2-week window but not in the last 2 weeks
    const atRisk = await prisma.player.findMany({
      where: {
        lastSeenAt: { gte: fourWeeksAgo, lt: twoWeeksAgo },
      },
      select: { id: true, username: true, lastSeenAt: true, joinCount: true },
      orderBy: { lastSeenAt: 'asc' },
      take: 50,
    });

    res.json(atRisk);
  } catch (err) { next(err); }
});
