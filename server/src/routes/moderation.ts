import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const moderationRouter = Router();

const reportSchema = z.object({
  reporterId: z.string().min(1),
  reportedId: z.string().min(1),
  reason: z.string().min(1),
  chatSnapshot: z.array(z.string()).default([]),
});

const resolveSchema = z.object({
  status: z.enum(['REVIEWED', 'ESCALATED', 'RESOLVED']),
});

const actionSchema = z.object({
  targetId: z.string().min(1),
  type: z.enum(['MUTE', 'UNMUTE', 'KICK', 'BAN', 'UNBAN']),
  reason: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

const blockSchema = z.object({
  blockerId: z.string().min(1),
  blockedId: z.string().min(1),
});

const chatLogSchema = z.object({
  playerId: z.string().min(1),
  username: z.string().min(1),
  message: z.string().min(1),
  flagged: z.boolean().optional().default(false),
});

// ── Reports ──────────────────────────────────────────────────────────────────

// GET /api/moderation/reports
moderationRouter.get('/reports', authMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const statusFilter = req.query.status as string | undefined;

    const where: Record<string, unknown> = {};
    if (statusFilter) where.status = statusFilter;

    const [total, data] = await Promise.all([
      prisma.moderationReport.count({ where }),
      prisma.moderationReport.findMany({
        where,
        orderBy: [{ escalated: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ data, meta: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// POST /api/moderation/reports  (service token — from plugin)
moderationRouter.post('/reports', serviceTokenMiddleware, validateBody(reportSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof reportSchema>;
    const report = await prisma.moderationReport.create({ data: { ...data } });

    // Check escalation: 3+ reports on same player in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.moderationReport.count({
      where: { reportedId: data.reportedId, createdAt: { gte: oneDayAgo } },
    });
    if (recentCount >= 3) {
      await prisma.moderationReport.updateMany({
        where: { reportedId: data.reportedId, status: 'PENDING' },
        data: { status: 'ESCALATED', escalated: true },
      });
    }

    res.status(201).json(report);
  } catch (err) { next(err); }
});

// PATCH /api/moderation/reports/:id
moderationRouter.patch('/reports/:id', authMiddleware, validateBody(resolveSchema), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { status } = req.body as z.infer<typeof resolveSchema>;
    const update: Record<string, unknown> = { status };
    if (status === 'RESOLVED') { update.resolvedAt = new Date(); update.resolvedBy = user.id; }
    const report = await prisma.moderationReport.update({ where: { id: req.params.id as string }, data: update as any });
    res.json(report);
  } catch (err) { next(err); }
});

// ── Actions (audit log) ───────────────────────────────────────────────────────

// POST /api/moderation/actions
moderationRouter.post('/actions', serviceTokenMiddleware, validateBody(actionSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof actionSchema>;
    const action = await prisma.moderationAction.create({
      data: {
        targetId: data.targetId,
        adminId: (req as any).serviceUser ?? 'system',
        type: data.type as any,
        reason: data.reason,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
    res.status(201).json(action);
  } catch (err) { next(err); }
});

// Also allow JWT (admin actions from dashboard)
moderationRouter.post('/actions/admin', authMiddleware, validateBody(actionSchema), async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'MODERATOR') return res.status(403).json({ message: 'Forbidden' });
    const data = req.body as z.infer<typeof actionSchema>;
    const action = await prisma.moderationAction.create({
      data: {
        targetId: data.targetId,
        adminId: user.id,
        type: data.type as any,
        reason: data.reason,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
    res.status(201).json(action);
  } catch (err) { next(err); }
});

// GET /api/moderation/audit-log
moderationRouter.get('/audit-log', authMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const targetId = req.query.targetId as string | undefined;

    const where: Record<string, unknown> = {};
    if (targetId) where.targetId = targetId;

    const [total, data] = await Promise.all([
      prisma.moderationAction.count({ where }),
      prisma.moderationAction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ data, meta: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ── Block list ────────────────────────────────────────────────────────────────

// POST /api/moderation/block
moderationRouter.post('/block', serviceTokenMiddleware, validateBody(blockSchema), async (req, res, next) => {
  try {
    const { blockerId, blockedId } = req.body as z.infer<typeof blockSchema>;
    const block = await prisma.playerBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
    res.status(201).json(block);
  } catch (err) { next(err); }
});

// DELETE /api/moderation/block
moderationRouter.delete('/block', serviceTokenMiddleware, validateBody(blockSchema), async (req, res, next) => {
  try {
    const { blockerId, blockedId } = req.body as z.infer<typeof blockSchema>;
    await prisma.playerBlock.deleteMany({ where: { blockerId, blockedId } });
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/moderation/block/:playerId
moderationRouter.get('/block/:playerId', serviceTokenMiddleware, async (req, res, next) => {
  try {
    const blocks = await prisma.playerBlock.findMany({
      where: { blockerId: req.params.playerId as string },
      select: { blockedId: true },
    });
    res.json(blocks.map((b) => b.blockedId));
  } catch (err) { next(err); }
});

// ── Chat log ──────────────────────────────────────────────────────────────────

// POST /api/moderation/chat-log  (service token, batch insert from plugin)
moderationRouter.post('/chat-log', serviceTokenMiddleware, async (req, res, next) => {
  try {
    const entries = z.array(chatLogSchema).parse(req.body);
    await prisma.chatLog.createMany({ data: entries });
    res.status(201).json({ inserted: entries.length });
  } catch (err) { next(err); }
});

// GET /api/moderation/chat-log
moderationRouter.get('/chat-log', authMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const search = req.query.search as string | undefined;
    const playerId = req.query.playerId as string | undefined;

    const where: Record<string, unknown> = {};
    if (playerId) where.playerId = playerId;
    if (search) where.message = { contains: search, mode: 'insensitive' };

    const [total, data] = await Promise.all([
      prisma.chatLog.count({ where }),
      prisma.chatLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ data, meta: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});
