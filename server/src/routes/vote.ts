import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const voteRouter = Router();

const webhookSchema = z.object({
  playerIgN: z.string().min(1),
  site: z.string().min(1),
  uuid: z.string().optional(),
});

const claimSchema = z.object({
  playerName: z.string().min(1),
});

// GET /api/vote/stats — service token (plugin polls weekly vote count)
voteRouter.get('/stats', serviceTokenMiddleware, async (_req, res, next) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyVotes = await prisma.pendingVote.count({
      where: { createdAt: { gte: weekAgo } },
    });
    res.json({ weeklyVotes });
  } catch (err) { next(err); }
});

// POST /api/vote/webhook — service token (voting site posts here after a vote)
voteRouter.post('/webhook', serviceTokenMiddleware, validateBody(webhookSchema), async (req, res, next) => {
  try {
    const { playerIgN, site, uuid } = req.body as z.infer<typeof webhookSchema>;

    // Deduplicate: one vote per player per site per hour
    const dedupKey = `vote:dedup:${playerIgN.toLowerCase()}:${site}`;
    const already = await redis.set(dedupKey, '1', 'EX', 3600, 'NX');
    if (already === null) {
      res.status(409).json({ error: 'CONFLICT', message: 'Vote already recorded recently' });
      return;
    }

    const vote = await prisma.pendingVote.create({
      data: { playerId: playerIgN, playerIgN, site },
    });
    res.status(201).json(vote);
  } catch (err) { next(err); }
});

// GET /api/vote/pending/:playerName — service token (plugin checks on join)
voteRouter.get('/pending/:playerName', serviceTokenMiddleware, async (req, res, next) => {
  try {
    const { playerName } = req.params as { playerName: string };
    const pending = await prisma.pendingVote.findFirst({
      where: { playerId: playerName, claimed: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!pending) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'No pending vote reward' });
      return;
    }
    res.json(pending);
  } catch (err) { next(err); }
});

// POST /api/vote/claim — service token (player uses /voteclaim)
voteRouter.post('/claim', serviceTokenMiddleware, validateBody(claimSchema), async (req, res, next) => {
  try {
    const { playerName } = req.body as z.infer<typeof claimSchema>;

    // Dedup: prevent double-claim within 5s
    const lockKey = `vote:claim:${playerName}`;
    const locked = await redis.set(lockKey, '1', 'EX', 5, 'NX');
    if (locked === null) {
      res.status(409).json({ error: 'CONFLICT', message: 'Claim already in progress' });
      return;
    }

    const vote = await prisma.pendingVote.findFirst({
      where: { playerId: playerName, claimed: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!vote) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'No pending vote reward' });
      return;
    }

    await prisma.pendingVote.update({
      where: { id: vote.id },
      data: { claimed: true, claimedAt: new Date() },
    });

    res.json({ claimed: true, site: vote.site, playerIgN: vote.playerIgN });
  } catch (err) { next(err); }
});
