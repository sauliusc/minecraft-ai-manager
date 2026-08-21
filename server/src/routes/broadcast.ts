import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { adminActionMiddleware } from '../middleware/adminAction.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { deliverBroadcast, BROADCAST_AUDIENCES } from '../services/broadcast.js';

export const broadcastRouter = Router();

// 500 matches the character counter the dashboard shows; enforced here too so an
// API client cannot push an unbounded string straight into `say`.
const MAX_CONTENT_LENGTH = 500;

const createSchema = z.object({
  content: z.string().min(1).max(MAX_CONTENT_LENGTH),
  channels: z.array(z.enum(['CHAT', 'TITLE', 'ACTION_BAR', 'DISCORD'])).min(1),
  audience: z.enum(BROADCAST_AUDIENCES).default('ALL'),
  scheduledAt: z.string().datetime().optional(),
});

const updateSchema = z.object({
  content: z.string().min(1).max(MAX_CONTENT_LENGTH).optional(),
  channels: z.array(z.string()).optional(),
  audience: z.enum(BROADCAST_AUDIENCES).optional(),
  scheduledAt: z.string().datetime().optional(),
  status: z.enum(['SCHEDULED', 'CANCELLED']).optional(),
});

function requireAdmin(req: any, res: any) {
  if (req.user?.role !== 'SUPER_ADMIN') { res.status(403).json({ message: 'Forbidden' }); return false; }
  return true;
}

// GET /api/broadcast/scheduled
broadcastRouter.get('/scheduled', authMiddleware, async (req, res, next) => {
  try {
    const messages = await prisma.broadcastMessage.findMany({
      where: { status: { in: ['SCHEDULED', 'DRAFT'] } },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(messages);
  } catch (err) { next(err); }
});

// POST /api/broadcast
broadcastRouter.post('/', authMiddleware, adminActionMiddleware({ resource: 'broadcast' }), validateBody(createSchema), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const user = (req as any).user;
    const data = req.body as z.infer<typeof createSchema>;

    const status = data.scheduledAt ? 'SCHEDULED' : 'SENT';
    const sentAt = data.scheduledAt ? null : new Date();

    const msg = await prisma.broadcastMessage.create({
      data: {
        content: data.content,
        channels: data.channels,
        audience: data.audience,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        status: status as any,
        sentAt,
        createdBy: user.sub,  // JWT payload uses 'sub', not 'id'
      },
    });

    // For immediate sends, deliver now (fire-and-forget; the DB record is the
    // audit trail). Scheduled sends are picked up by the broadcast scheduler.
    if (!data.scheduledAt) {
      deliverBroadcast(data.channels, data.content, data.audience).catch((err) => {
        console.error(`[broadcast] immediate delivery failed for ${msg.id}:`, err);
      });
    }

    res.status(201).json(msg);
  } catch (err) { next(err); }
});

// GET /api/broadcast/pending  (service token)
// Read-only view of what is still queued. Delivery is done by the scheduler in
// services/broadcastScheduler.ts — this used to mark rows SENT as a side effect
// of the GET while nothing anywhere actually delivered them (#305).
broadcastRouter.get('/pending', serviceTokenMiddleware, async (_req, res, next) => {
  try {
    const pending = await prisma.broadcastMessage.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(pending);
  } catch (err) { next(err); }
});

// DELETE /api/broadcast/scheduled/:id
broadcastRouter.delete('/scheduled/:id', authMiddleware, adminActionMiddleware({ resource: 'broadcast' }), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    await prisma.broadcastMessage.update({
      where: { id: req.params.id as string },
      data: { status: 'CANCELLED' },
    });
    res.status(204).end();
  } catch (err) { next(err); }
});

// PATCH /api/broadcast/scheduled/:id
broadcastRouter.patch('/scheduled/:id', authMiddleware, adminActionMiddleware({ resource: 'broadcast' }), validateBody(updateSchema), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const data = req.body as z.infer<typeof updateSchema>;
    const update: Record<string, unknown> = {};
    if (data.content) update.content = data.content;
    if (data.channels) update.channels = data.channels;
    if (data.audience) update.audience = data.audience;
    if (data.scheduledAt) update.scheduledAt = new Date(data.scheduledAt);
    if (data.status) update.status = data.status;
    const msg = await prisma.broadcastMessage.update({ where: { id: req.params.id as string }, data: update as any });
    res.json(msg);
  } catch (err) { next(err); }
});

const TRIGGER_TYPES = ['DAILY_LOGIN', 'MILESTONE', 'LOW_ACTIVITY'] as const;

const triggerSchema = z.object({
  type: z.enum(TRIGGER_TYPES),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const triggersUpsertSchema = z.array(triggerSchema).min(1);

// GET /api/broadcast/triggers
broadcastRouter.get('/triggers', authMiddleware, async (_req, res, next) => {
  try {
    const triggers = await prisma.broadcastTrigger.findMany({ orderBy: { type: 'asc' } });
    res.json(triggers);
  } catch (err) { next(err); }
});

// PUT /api/broadcast/triggers — upsert one or many trigger rules (SUPER_ADMIN)
broadcastRouter.put('/triggers', authMiddleware, validateBody(triggersUpsertSchema), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const user = (req as any).user;
    const entries = req.body as z.infer<typeof triggersUpsertSchema>;

    const results = await Promise.all(
      entries.map((entry) =>
        prisma.broadcastTrigger.upsert({
          where: { type: entry.type as any },
          create: {
            type: entry.type as any,
            enabled: entry.enabled ?? true,
            config: (entry.config ?? {}) as any,
            updatedBy: user.sub,
          },
          update: {
            ...(entry.enabled !== undefined ? { enabled: entry.enabled } : {}),
            ...(entry.config !== undefined ? { config: entry.config as any } : {}),
            updatedBy: user.sub,
          },
        })
      )
    );

    res.json(results);
  } catch (err) { next(err); }
});
