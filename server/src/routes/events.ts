import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { adminActionMiddleware } from '../middleware/adminAction.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const eventsRouter = Router();

const GameEventTypeEnum = z.enum(['BOSS_RAID', 'TREASURE_HUNT', 'BUILD_BATTLE', 'CLAN_WAR']);
const GameEventStateEnum = z.enum(['UPCOMING', 'ACTIVE', 'FINISHED']);

const createSchema = z.object({
  type: GameEventTypeEnum,
  title: z.string().min(1),
  scheduledAt: z.string().datetime(),
  config: z.record(z.unknown()).optional().default({}),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  scheduledAt: z.string().datetime().optional(),
  state: GameEventStateEnum.optional(),
  action: z.enum(['start', 'end']).optional(),
  config: z.record(z.unknown()).optional(),
  participantCount: z.number().int().min(0).optional(),
});

const leaderboardEntrySchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  score: z.number(),
});

const completeSchema = z.object({
  winnerId: z.string().optional(),
  leaderboardEntries: z.array(leaderboardEntrySchema).optional(),
});

// GET /api/events
eventsRouter.get('/', authMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const stateFilter = req.query.state as string | undefined;
    const typeFilter = req.query.type as string | undefined;

    const where: Record<string, unknown> = {};
    if (stateFilter) where.state = stateFilter;
    if (typeFilter) where.type = typeFilter;

    const [total, data] = await Promise.all([
      prisma.gameEvent.count({ where }),
      prisma.gameEvent.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ data, meta: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// GET /api/events/active  (service token — NPC plugin checks on right-click for dynamic dialogue)
eventsRouter.get('/active', serviceTokenMiddleware, async (_req, res, next) => {
  try {
    const events = await prisma.gameEvent.findMany({
      where: { state: 'ACTIVE' },
      select: { id: true, type: true, title: true, scheduledAt: true, participantCount: true },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(events);
  } catch (err) { next(err); }
});

// GET /api/events/upcoming  (service token — for plugin polling)
eventsRouter.get('/upcoming', serviceTokenMiddleware, async (_req, res, next) => {
  try {
    const now = new Date();
    const lookahead = new Date(now.getTime() + 35 * 60 * 1000); // 35 min ahead
    const lookback  = new Date(now.getTime() - 15 * 60 * 1000); // 15 min grace window

    // Return:
    //  - ACTIVE events regardless of time (for resumption tracking)
    //  - UPCOMING events scheduled within the last 15 min or the next 35 min
    //    (events more than 15 min overdue are considered missed/stale and
    //     must NOT be auto-spawned on server restart)
    const events = await prisma.gameEvent.findMany({
      where: {
        OR: [
          { state: 'ACTIVE' },
          {
            state: 'UPCOMING',
            scheduledAt: { gte: lookback, lte: lookahead },
          },
        ],
      },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(events);
  } catch (err) { next(err); }
});

// GET /api/events/:id
eventsRouter.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const event = await prisma.gameEvent.findUnique({
      where: { id: (req.params.id as string) },
      include: { leaderboard: { orderBy: { score: 'desc' }, take: 20 } },
    });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (err) { next(err); }
});

// GET /api/events/:id/leaderboard
eventsRouter.get('/:id/leaderboard', authMiddleware, async (req, res, next) => {
  try {
    const entries = await prisma.eventLeaderboardEntry.findMany({
      where: { eventId: (req.params.id as string) },
      orderBy: { score: 'desc' },
      take: 20,
    });
    res.json({ entries });
  } catch (err) { next(err); }
});

// POST /api/events  (SUPER_ADMIN)
eventsRouter.post('/', authMiddleware, adminActionMiddleware({ resource: 'event' }), validateBody(createSchema), async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });

    const data = req.body as z.infer<typeof createSchema>;
    const event = await prisma.gameEvent.create({
      data: {
        type: data.type as any,
        title: data.title,
        scheduledAt: new Date(data.scheduledAt),
        config: data.config as any,
      },
    });
    res.status(201).json(event);
  } catch (err) { next(err); }
});

// PATCH /api/events/:id
eventsRouter.patch('/:id', authMiddleware, adminActionMiddleware({ resource: 'event' }), validateBody(updateSchema), async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });

    const body = req.body as z.infer<typeof updateSchema>;
    const update: Record<string, unknown> = {};

    if (body.title) update.title = body.title;
    if (body.scheduledAt) update.scheduledAt = new Date(body.scheduledAt);
    if (body.config) update.config = body.config;
    if (body.participantCount !== undefined) update.participantCount = body.participantCount;

    if (body.action === 'start') {
      update.state = 'ACTIVE';
    } else if (body.action === 'end') {
      update.state = 'FINISHED';
      update.endedAt = new Date();
    } else if (body.state) {
      update.state = body.state;
      if (body.state === 'FINISHED') update.endedAt = new Date();
    }

    const event = await prisma.gameEvent.update({
      where: { id: (req.params.id as string) },
      data: update as any,
    });
    res.json(event);
  } catch (err) { next(err); }
});

// POST /api/events/:id/complete  (service token — from plugin)
eventsRouter.post('/:id/complete', serviceTokenMiddleware, validateBody(completeSchema), async (req, res, next) => {
  try {
    const { winnerId, leaderboardEntries } = req.body as z.infer<typeof completeSchema>;

    const update: Record<string, unknown> = { state: 'FINISHED', endedAt: new Date() };
    if (winnerId) (update.config as any) = { winnerId };

    const event = await prisma.gameEvent.update({
      where: { id: (req.params.id as string) },
      data: update as any,
    });

    if (leaderboardEntries?.length) {
      await Promise.all(
        leaderboardEntries.map((e) =>
          prisma.eventLeaderboardEntry.upsert({
            where: { eventId_playerId: { eventId: (req.params.id as string), playerId: e.playerId } },
            create: { eventId: (req.params.id as string), playerId: e.playerId, playerName: e.playerName, score: e.score },
            update: { score: e.score, playerName: e.playerName },
          })
        )
      );
    }

    res.json(event);
  } catch (err) { next(err); }
});

// DELETE /api/events/:id  (SUPER_ADMIN, upcoming only)
eventsRouter.delete('/:id', authMiddleware, adminActionMiddleware({ resource: 'event' }), async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });

    const event = await prisma.gameEvent.findUnique({ where: { id: (req.params.id as string) } });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.state !== 'UPCOMING') return res.status(409).json({ message: 'Can only delete upcoming events' });

    await prisma.gameEvent.delete({ where: { id: (req.params.id as string) } });
    res.status(204).end();
  } catch (err) { next(err); }
});
