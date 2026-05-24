import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const activityLogRouter = Router();

// GET /api/activity-log
activityLogRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const userId = req.query.userId as string | undefined;
    const resource = req.query.resource as string | undefined;
    const method = req.query.method as string | undefined;
    const status = req.query.status as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (resource) where.resource = { contains: resource, mode: 'insensitive' };
    if (method) where.method = method.toUpperCase();
    if (status) where.status = status;
    if (from || to) {
      const dateFilter: Record<string, unknown> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.createdAt = dateFilter;
    }

    const [total, data] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});
