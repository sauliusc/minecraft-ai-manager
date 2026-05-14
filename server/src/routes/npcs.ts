import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const npcsRouter = Router();

const npcSchema = z.object({
  name: z.string().min(1),
  skinUrl: z.string().default(''),
  title: z.string().default(''),
  locWorld: z.string().default('world'),
  locX: z.number().default(0),
  locY: z.number().default(64),
  locZ: z.number().default(0),
  locYaw: z.number().default(0),
  type: z.enum(['GUIDE', 'QUEST_GIVER', 'MERCHANT']).default('GUIDE'),
  dialogueLines: z.array(z.string()).default([]),
  questIds: z.array(z.string()).default([]),
});

function requireSuperAdmin(req: any, res: any): boolean {
  if (req.user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'SUPER_ADMIN role required' });
    return false;
  }
  return true;
}

// GET /api/npcs/sync — service token only (plugin polls this)
// NOTE: must be defined before /:id to avoid route conflict
npcsRouter.get('/sync', async (req, res, next) => {
  try {
    const serviceToken = process.env.SERVICE_TOKEN;
    if (req.headers.authorization !== 'Bearer ' + serviceToken) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid service token' });
      return;
    }
    const npcs = await prisma.npcDefinition.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(npcs);
  } catch (err) { next(err); }
});

// GET /api/npcs — list all NPCs (auth required)
npcsRouter.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const npcs = await prisma.npcDefinition.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(npcs);
  } catch (err) { next(err); }
});

// GET /api/npcs/:id — single NPC (auth required)
npcsRouter.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const npc = await prisma.npcDefinition.findUnique({ where: { id: req.params.id as string } });
    if (!npc) { res.status(404).json({ error: 'NOT_FOUND', message: 'NPC not found' }); return; }
    res.json(npc);
  } catch (err) { next(err); }
});

// POST /api/npcs — create NPC (SUPER_ADMIN only)
npcsRouter.post('/', authMiddleware, validateBody(npcSchema), async (req, res, next) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const data = req.body as z.infer<typeof npcSchema>;
    const npc = await prisma.npcDefinition.create({ data: { ...data, type: data.type as any } });
    res.status(201).json(npc);
  } catch (err) { next(err); }
});

// PATCH /api/npcs/:id — update NPC (SUPER_ADMIN only)
npcsRouter.patch('/:id', authMiddleware, validateBody(npcSchema.partial()), async (req, res, next) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const data = req.body as Partial<z.infer<typeof npcSchema>>;
    const npc = await prisma.npcDefinition.update({
      where: { id: req.params.id as string },
      data: { ...data, type: data.type as any },
    });
    res.json(npc);
  } catch (err) { next(err); }
});

// DELETE /api/npcs/:id — delete NPC (SUPER_ADMIN only)
npcsRouter.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    await prisma.npcDefinition.delete({ where: { id: req.params.id as string } });
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/npcs/:npcId/relationship/:playerId — get or create PlayerNpcRelationship
npcsRouter.get('/:npcId/relationship/:playerId', authMiddleware, async (req, res, next) => {
  try {
    const npcId = req.params.npcId as string;
    const playerId = req.params.playerId as string;
    const relationship = await prisma.playerNpcRelationship.upsert({
      where: { playerId_npcId: { playerId, npcId } },
      create: { playerId, npcId, completedQuestIds: [] },
      update: {},
    });
    res.json(relationship);
  } catch (err) { next(err); }
});

// POST /api/npcs/:npcId/relationship/:playerId/quest-complete
// body: { questId: string } — increment score by 10, add questId to completedQuestIds
npcsRouter.post('/:npcId/relationship/:playerId/quest-complete', authMiddleware, async (req, res, next) => {
  try {
    const npcId = req.params.npcId as string;
    const playerId = req.params.playerId as string;
    const { questId } = z.object({ questId: z.string().min(1) }).parse(req.body);

    const existing = await prisma.playerNpcRelationship.upsert({
      where: { playerId_npcId: { playerId, npcId } },
      create: { playerId, npcId, relationshipScore: 10, completedQuestIds: [questId] },
      update: {},
    });

    const alreadyDone = existing.completedQuestIds.includes(questId);
    const updated = await prisma.playerNpcRelationship.update({
      where: { playerId_npcId: { playerId, npcId } },
      data: {
        relationshipScore: alreadyDone ? existing.relationshipScore : { increment: 10 },
        completedQuestIds: alreadyDone
          ? existing.completedQuestIds
          : { push: questId },
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});
