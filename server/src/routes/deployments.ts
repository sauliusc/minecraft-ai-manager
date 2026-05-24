import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const deploymentsRouter = Router();

const createDeploymentSchema = z.object({
  imageTag:    z.string().min(1),
  triggeredBy: z.string().min(1),
  action:      z.enum(['deploy', 'restart', 'start', 'stop']),
  notes:       z.string().optional(),
});

// POST /api/deployments — service token (called by deploy.sh or minecraft route)
deploymentsRouter.post('/', serviceTokenMiddleware, validateBody(createDeploymentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body as z.infer<typeof createDeploymentSchema>;
    const deployment = await prisma.deployment.create({ data });
    res.status(201).json(deployment);
  } catch (err) {
    next(err);
  }
});

// GET /api/deployments — authenticated users (read-only)
deploymentsRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, Number(req.query.page  ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));

    const [total, deployments] = await Promise.all([
      prisma.deployment.count(),
      prisma.deployment.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      data: deployments,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});
