import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { adminActionMiddleware } from '../middleware/adminAction.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { withRcon } from '../lib/rcon.js';

export const broadcastRouter = Router();

const createSchema = z.object({
  content: z.string().min(1),
  channels: z.array(z.enum(['CHAT', 'TITLE', 'ACTION_BAR', 'DISCORD'])).min(1),
  audience: z.string().default('ALL'),
  scheduledAt: z.string().datetime().optional(),
});

const updateSchema = z.object({
  content: z.string().min(1).optional(),
  channels: z.array(z.string()).optional(),
  audience: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  status: z.enum(['SCHEDULED', 'CANCELLED']).optional(),
});

async function deliverViaRcon(channels: string[], content: string): Promise<void> {
  const safe = content.replace(/[\r\n]+/g, ' ');
  const textJson = JSON.stringify({ text: safe });
  await withRcon(async (rcon) => {
    const cmds: string[] = [];
    if (channels.includes('CHAT')) cmds.push(`say ${safe}`);
    if (channels.includes('TITLE')) cmds.push(`title @a title ${textJson}`);
    if (channels.includes('ACTION_BAR')) cmds.push(`title @a actionbar ${textJson}`);
    await Promise.all(cmds.map((cmd) => rcon.send(cmd)));
  });
}

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

    // For immediate sends, deliver via RCON (fire-and-forget; DB record is the audit trail)
    if (!data.scheduledAt) {
      deliverViaRcon(data.channels, data.content).catch(() => {});
    }

    res.status(201).json(msg);
  } catch (err) { next(err); }
});

// GET /api/broadcast/pending  (service token — plugin polls this)
broadcastRouter.get('/pending', serviceTokenMiddleware, async (req, res, next) => {
  try {
    const now = new Date();
    const pending = await prisma.broadcastMessage.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
    });
    // Mark as sent
    if (pending.length > 0) {
      await prisma.broadcastMessage.updateMany({
        where: { id: { in: pending.map((m) => m.id) } },
        data: { status: 'SENT', sentAt: now },
      });
    }
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
