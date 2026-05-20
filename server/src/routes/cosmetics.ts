import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const cosmeticsRouter = Router();

const equippedSchema = z.object({
  titleId: z.string().nullable().optional(),
  chatColor: z.string().nullable().optional(),
  particleType: z.string().nullable().optional(),
  petType: z.string().nullable().optional(),
  trailType: z.string().nullable().optional(),
});

const titleSchema = z.object({
  name: z.string().min(1).max(32),
  description: z.string().max(256).optional(),
});

// GET /api/cosmetics/titles — service token OR JWT (plugin + dashboard)
cosmeticsRouter.get('/titles', async (req, res, next) => {
  const authHeader = req.headers.authorization ?? '';
  const isServiceToken = authHeader.startsWith('Bearer ') && authHeader.slice(7) === process.env.BRIDGE_SECRET;
  if (isServiceToken) {
    try {
      const titles = await prisma.cosmeticTitle.findMany({ orderBy: { name: 'asc' } });
      return res.json(titles);
    } catch (err) { return next(err); }
  }
  // Fall through to JWT check
  return authMiddleware(req, res, async () => {
    try {
      const titles = await prisma.cosmeticTitle.findMany({ orderBy: { name: 'asc' } });
      res.json(titles);
    } catch (err) { next(err); }
  });
});

// POST /api/cosmetics/titles — JWT SUPER_ADMIN (admin creates titles)
cosmeticsRouter.post('/titles', authMiddleware, validateBody(titleSchema), async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'FORBIDDEN', message: 'SUPER_ADMIN required', statusCode: 403 });
      return;
    }
    const { name, description } = req.body as z.infer<typeof titleSchema>;
    const title = await prisma.cosmeticTitle.create({ data: { name, description: description ?? '' } });
    res.status(201).json(title);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'CONFLICT', message: 'Title name already exists', statusCode: 409 });
      return;
    }
    next(err);
  }
});

// DELETE /api/cosmetics/titles/:id — JWT SUPER_ADMIN
cosmeticsRouter.delete('/titles/:id', authMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'FORBIDDEN', message: 'SUPER_ADMIN required', statusCode: 403 });
      return;
    }
    await prisma.cosmeticTitle.delete({ where: { id: req.params.id as string } });
    res.status(204).end();
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Title not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

// GET /api/cosmetics/:playerId/equipped — service token
cosmeticsRouter.get('/:playerId/equipped', serviceTokenMiddleware, async (req, res, next) => {
  try {
    const { playerId } = req.params as { playerId: string };
    const cosmetics = await prisma.playerCosmetics.findUnique({ where: { playerId } });
    res.json(cosmetics ?? { playerId, titleId: null, chatColor: null, particleType: null, petType: null, trailType: null });
  } catch (err) { next(err); }
});

// PATCH /api/cosmetics/:playerId/equipped — service token
cosmeticsRouter.patch('/:playerId/equipped', serviceTokenMiddleware, validateBody(equippedSchema), async (req, res, next) => {
  try {
    const { playerId } = req.params as { playerId: string };
    const data = req.body as z.infer<typeof equippedSchema>;

    const update: Record<string, unknown> = {};
    if ('titleId' in data) update.titleId = data.titleId ?? null;
    if ('chatColor' in data) update.chatColor = data.chatColor ?? null;
    if ('particleType' in data) update.particleType = data.particleType ?? null;
    if ('petType' in data) update.petType = data.petType ?? null;
    if ('trailType' in data) update.trailType = data.trailType ?? null;

    const cosmetics = await prisma.playerCosmetics.upsert({
      where: { playerId },
      create: { playerId, ...update },
      update,
    });
    res.json(cosmetics);
  } catch (err) { next(err); }
});
