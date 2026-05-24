import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, requireAutoConfirm } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { executeStoredAction } from '../lib/actionExecutor.js';

export const pendingActionsRouter = Router();

// All routes require auth + autoConfirm
pendingActionsRouter.use(authMiddleware, requireAutoConfirm);

// GET /api/pending-actions
pendingActionsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [total, data] = await Promise.all([
      prisma.pendingAction.count({ where }),
      prisma.pendingAction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ data, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});

// GET /api/pending-actions/:id
pendingActionsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await prisma.pendingAction.findUnique({ where: { id: req.params.id as string } });
    if (!pending) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Pending action not found', statusCode: 404 });
      return;
    }
    res.json(pending);
  } catch (err) {
    next(err);
  }
});

// POST /api/pending-actions/:id/confirm
pendingActionsRouter.post('/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params.id as string;

    const pending = await prisma.pendingAction.findUnique({ where: { id } });
    if (!pending) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Pending action not found', statusCode: 404 });
      return;
    }
    if (pending.status !== 'PENDING') {
      res.status(409).json({ error: 'CONFLICT', message: 'Action is not in PENDING status', statusCode: 409 });
      return;
    }

    const executorResult = await executeStoredAction(id, user.sub);

    const now = new Date();
    await prisma.pendingAction.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        reviewedBy: user.sub,
        reviewedAt: now,
        executedAt: now,
        result: executorResult as any,
      },
    });

    await prisma.activityLog.updateMany({
      where: { pendingActionId: id },
      data: { status: 'CONFIRMED' },
    });

    res.json({ ok: true, result: executorResult.body, executionStatus: executorResult.status });
  } catch (err) {
    next(err);
  }
});

// POST /api/pending-actions/:id/reject
pendingActionsRouter.post('/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params.id as string;

    const pending = await prisma.pendingAction.findUnique({ where: { id } });
    if (!pending) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Pending action not found', statusCode: 404 });
      return;
    }
    if (pending.status !== 'PENDING') {
      res.status(409).json({ error: 'CONFLICT', message: 'Action is not in PENDING status', statusCode: 409 });
      return;
    }

    const now = new Date();
    await prisma.pendingAction.update({
      where: { id },
      data: { status: 'REJECTED', reviewedBy: user.sub, reviewedAt: now },
    });

    await prisma.activityLog.updateMany({
      where: { pendingActionId: id },
      data: { status: 'REJECTED' },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
