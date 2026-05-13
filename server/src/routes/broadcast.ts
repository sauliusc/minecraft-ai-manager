import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

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
broadcastRouter.post('/', authMiddleware, validateBody(createSchema), async (req, res, next) => {
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
        createdBy: user.id,
      },
    });

    // If sending now, the bridge would be called here (fire-and-forget)
    // Actual in-game delivery is handled by the plugin via polling /api/broadcast/pending

    res.status(201).json(msg);
  } catch (err) { next(err); }
});

// GET /api/broadcast/pending  (service token — plugin polls this)
broadcastRouter.get('/pending', authMiddleware, async (req, res, next) => {
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
broadcastRouter.delete('/scheduled/:id', authMiddleware, async (req, res, next) => {
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
broadcastRouter.patch('/scheduled/:id', authMiddleware, validateBody(updateSchema), async (req, res, next) => {
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
